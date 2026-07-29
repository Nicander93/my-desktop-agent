/**
 * 评测：拷 fixture → 跑 Agent → diff → Verifier → 写 result。
 * 不依赖 Electron。隔离约定在 evaluationPrompt（含 pnpm --ignore-workspace）。
 * 超时 cancel 和收证有竞态，见 docs/eval/Code-Review-v0-v1.md。
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { AgentRuntime, type RuntimeCapability, type RuntimeOptions } from '@desktop-agent/agent-runtime';
import type { EvaluationResult, EvaluationTask } from '@desktop-agent/shared';
import { formatSdkEvent, type ProgressSink } from './progress.js';
import type { LoadedEvaluationTask } from './task.js';
import { verifyTask } from './verifier.js';
import { prepareWorkspace, writeDiff } from './workspace.js';

export interface AgentExecution {
  text: string;
  trace: unknown[];
  error?: string;
}

export interface AgentExecutor {
  execute(task: EvaluationTask, workspacePath: string, sessionId: string, onProgress?: ProgressSink): Promise<AgentExecution>;
  cancel?(sessionId: string): Promise<void>;
}

/** includeEnvironmentContext=false，免得宿主 git 状态漏进隔离目录 */
export class RuntimeAgentExecutor implements AgentExecutor {
  private readonly sessions = new Map<string, AgentRuntime>();

  constructor(
    private readonly runtimeOptions: RuntimeOptions,
    private readonly subprocessEnv?: Record<string, string>,
  ) {}

  async execute(task: EvaluationTask, workspacePath: string, sessionId: string, onProgress?: ProgressSink): Promise<AgentExecution> {
    const log = onProgress ?? (() => undefined);
    const runtime = new AgentRuntime({
      ...this.runtimeOptions,
      maxTurns: task.limits?.maxTurns ?? this.runtimeOptions.maxTurns,
      includeEnvironmentContext: false,
    });
    this.sessions.set(sessionId, runtime);
    try {
      const evaluationPrompt = [
        'This is an isolated evaluation workspace. Work only inside the current working directory.',
        ...codingEvalConstraints(task),
        task.prompt,
      ].join('\n\n');
      const stream = await runtime.sendMessage(
        sessionId,
        evaluationPrompt,
        {
          cwd: workspacePath,
          ...(this.subprocessEnv ? { subprocessEnv: this.subprocessEnv } : {}),
        },
        {
          profile: task.profile,
          capabilities: task.capabilities as RuntimeCapability[],
          ...(task.limits?.maxTurns != null ? { maxTurns: task.limits.maxTurns } : {}),
        },
      );
      let text = '';
      let executionError: string | undefined;
      for await (const event of stream) {
        const line = formatSdkEvent(event);
        if (line) log(line);
        if (event.type === 'assistant') {
          const fragments = (Array.isArray(event.message?.content) ? event.message.content : [])
            .filter((block): block is { type: 'text'; text: string } => !!block && typeof block === 'object' && 'type' in block && block.type === 'text' && 'text' in block && typeof block.text === 'string')
            .map((block) => block.text);
          if (fragments.length > 0) text = fragments.join('');
        }
        if (event.type === 'result') {
          if (event.is_error || event.subtype === 'error' || event.subtype === 'error_during_execution' || event.subtype === 'error_max_turns') {
            executionError = event.errors?.join('; ') || `Agent execution failed (${event.subtype}).`;
          }
        }
      }
      return {
        text,
        trace: runtime.getAgent(sessionId)?.getTrace() ?? [],
        ...(executionError ? { error: executionError } : {}),
      };
    } finally {
      this.sessions.delete(sessionId);
      await runtime.close(sessionId);
    }
  }

  async cancel(sessionId: string): Promise<void> {
    const runtime = this.sessions.get(sessionId);
    if (!runtime) return;
    await runtime.getAgent(sessionId)?.interrupt();
    await runtime.close(sessionId);
  }
}

/** status 以 Verifier 为准，不看模型嘴上说没说完成 */
export async function runTask(task: LoadedEvaluationTask, options: {
  outputRoot: string;
  executor: AgentExecutor;
  model: { model: string; baseURL?: string };
  onProgress?: ProgressSink;
}): Promise<EvaluationResult> {
  const log = options.onProgress ?? (() => undefined);
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const runDirectory = join(options.outputRoot, task.id, runId);
  const workspacePath = join(runDirectory, 'workspace');
  const baselinePath = join(runDirectory, 'baseline');
  const resultPath = join(runDirectory, 'result.json');
  const tracePath = join(runDirectory, 'trace.json');
  const diffPath = join(runDirectory, 'diff.patch');
  const startedAt = new Date().toISOString();
  const started = performance.now();
  log(`[eval] start ${task.id}@${task.version} model=${options.model.model}${options.model.baseURL ? ` baseURL=${options.model.baseURL}` : ''}`);
  log(`[eval] limits maxTurns=${task.limits?.maxTurns ?? 'default'} timeoutMs=${task.limits?.timeoutMs ?? 'none'}`);
  await mkdir(runDirectory, { recursive: true });
  const fixturePath = resolve(dirname(task.definitionPath), task.fixture);
  log(`[eval] prepare workspace → ${workspacePath}`);
  await prepareWorkspace(fixturePath, baselinePath, workspacePath);

  let execution: AgentExecution | undefined;
  let error: string | undefined;
  let timedOut = false;
  const sessionId = `agent-eval-${task.id}-${randomUUID()}`;
  try {
    log('[eval] agent running…');
    execution = await withTimeout(
      () => options.executor.execute(task, workspacePath, sessionId, log),
      task.limits?.timeoutMs,
      () => options.executor.cancel?.(sessionId),
    );
    if (execution.error) error = execution.error;
  } catch (cause) {
    timedOut = cause instanceof EvaluationTimeoutError;
    error = cause instanceof Error ? cause.message : String(cause);
    log(`[eval] agent error: ${error}`);
  }

  if (execution) await writeFile(tracePath, `${JSON.stringify(execution.trace, null, 2)}\n`, 'utf8');
  log('[eval] write diff + verify');
  const changedFiles = await writeDiff(baselinePath, workspacePath, diffPath);
  const verifier = await verifyTask(task, workspacePath, baselinePath);
  if (task.limits?.maxChangedFiles !== undefined) {
    verifier.checks.push({
      id: 'changed-files-limit',
      passed: changedFiles <= task.limits.maxChangedFiles,
      evidence: `Changed ${changedFiles} files (maximum ${task.limits.maxChangedFiles}).`,
      durationMs: 0,
    });
    verifier.passed = verifier.checks.every((check) => check.passed);
  }
  for (const check of verifier.checks) {
    log(`[verify] ${check.passed ? 'pass' : 'FAIL'} ${check.id}${check.evidence ? ` — ${truncateEvidence(check.evidence)}` : ''}`);
  }
  const endedAt = new Date().toISOString();
  const result: EvaluationResult = {
    schemaVersion: 1,
    runId,
    taskId: task.id,
    taskVersion: task.version,
    status: timedOut ? 'timeout' : error ? 'error' : verifier.passed ? 'passed' : 'failed',
    startedAt,
    endedAt,
    durationMs: Math.round(performance.now() - started),
    requestedProfile: task.profile,
    capabilities: [...task.capabilities],
    model: options.model,
    verifier,
    artifacts: { workspacePath, tracePath: execution ? tracePath : undefined, diffPath, resultPath },
    error,
    failure: classifyFailure(timedOut, error, execution?.trace, verifier.passed),
  };
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  log(`[eval] ${result.status} in ${result.durationMs}ms → ${resultPath}`);
  return result;
}

function truncateEvidence(evidence: string): string {
  const flat = evidence.replace(/\s+/g, ' ').trim();
  return flat.length > 160 ? `${flat.slice(0, 159)}…` : flat;
}

function classifyFailure(timedOut: boolean, error: string | undefined, trace: unknown[] | undefined, verifierPassed: boolean): EvaluationResult['failure'] {
  if (timedOut) return { category: 'timeout', reason: 'Evaluation deadline exceeded.' };
  if (error) return { category: 'agent', reason: error };
  const serializedTrace = JSON.stringify(trace ?? []);
  if (/spawn (EPERM|EACCES|EINVAL|ENOENT)/i.test(serializedTrace)) {
    return { category: 'environment', reason: 'A required tool process could not be started.' };
  }
  return verifierPassed ? undefined : { category: 'verifier', reason: 'One or more deterministic verification checks failed.' };
}

/** coding 任务才禁改 package.json/tests；SD-003 等依赖升级任务以 task.prompt 为准 */
function codingEvalConstraints(task: EvaluationTask): string[] {
  if (task.profile !== 'coding') {
    return ['Prefer creating outputs under the paths named in the task. Do not modify protected input fixtures.'];
  }
  const mayTouchPackageJson = /\bpackage\.json\b/i.test(task.prompt) && /(升级|upgrade|dependenc)/i.test(task.prompt);
  return [
    mayTouchPackageJson
      ? 'You may update package.json when the task requires a dependency upgrade. Do not modify tests unless the task explicitly asks.'
      : 'Do not modify tests or package.json. Inspect the source and tests, make the smallest correct source change, and verify it.',
    'When this fixture uses pnpm, run its scripts as `pnpm --ignore-workspace <script>` so it stays isolated from the host repository.',
  ];
}

class EvaluationTimeoutError extends Error {}

/** 超时后调 cancel；目前不等 cancel 结束就往下抛 */
async function withTimeout<T>(run: () => Promise<T>, timeoutMs: number | undefined, cancel: () => Promise<void> | undefined): Promise<T> {
  if (!timeoutMs) return run();
  const execution = run();
  void execution.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      execution,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new EvaluationTimeoutError(`Evaluation timed out after ${timeoutMs}ms.`)), timeoutMs); }),
    ]);
  } catch (error) {
    if (error instanceof EvaluationTimeoutError) await cancel();
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
