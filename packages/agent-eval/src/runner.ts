import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { AgentRuntime, type RuntimeCapability, type RuntimeOptions } from '@desktop-agent/agent-runtime';
import type { EvaluationResult, EvaluationTask } from '@desktop-agent/shared';
import type { LoadedEvaluationTask } from './task.js';
import { verifyTask } from './verifier.js';
import { prepareWorkspace, writeDiff } from './workspace.js';

export interface AgentExecution {
  text: string;
  trace: unknown[];
}

export interface AgentExecutor {
  execute(task: EvaluationTask, workspacePath: string, sessionId: string): Promise<AgentExecution>;
  cancel?(sessionId: string): Promise<void>;
}

/** Runtime adapter deliberately imports no Electron or renderer code. */
export class RuntimeAgentExecutor implements AgentExecutor {
  private readonly sessions = new Map<string, AgentRuntime>();

  constructor(private readonly runtimeOptions: RuntimeOptions) {}

  async execute(task: EvaluationTask, workspacePath: string, sessionId: string): Promise<AgentExecution> {
    const runtime = new AgentRuntime({
      ...this.runtimeOptions,
      maxTurns: task.limits?.maxTurns ?? this.runtimeOptions.maxTurns,
      includeEnvironmentContext: false,
    });
    this.sessions.set(sessionId, runtime);
    try {
      const evaluationPrompt = [
        'This is an isolated evaluation workspace. Work only inside the current working directory.',
        'Do not modify tests or package.json. Inspect the source and tests, make the smallest correct source change, and verify it.',
        'When this fixture uses pnpm, run its scripts as `pnpm --ignore-workspace <script>` so it stays isolated from the host repository.',
        task.prompt,
      ].join('\n\n');
      const text = await runtime.prompt(sessionId, evaluationPrompt, { cwd: workspacePath }, { profile: task.profile, capabilities: task.capabilities as RuntimeCapability[] });
      return { text, trace: runtime.getAgent(sessionId)?.getTrace() ?? [] };
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

export async function runTask(task: LoadedEvaluationTask, options: {
  outputRoot: string;
  executor: AgentExecutor;
  model: { model: string; baseURL?: string };
}): Promise<EvaluationResult> {
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const runDirectory = join(options.outputRoot, task.id, runId);
  const workspacePath = join(runDirectory, 'workspace');
  const baselinePath = join(runDirectory, 'baseline');
  const resultPath = join(runDirectory, 'result.json');
  const tracePath = join(runDirectory, 'trace.json');
  const diffPath = join(runDirectory, 'diff.patch');
  const startedAt = new Date().toISOString();
  const started = performance.now();
  await mkdir(runDirectory, { recursive: true });
  const fixturePath = resolve(dirname(task.definitionPath), task.fixture);
  await prepareWorkspace(fixturePath, baselinePath, workspacePath);

  let execution: AgentExecution | undefined;
  let error: string | undefined;
  let timedOut = false;
  const sessionId = `agent-eval-${task.id}-${randomUUID()}`;
  try {
    execution = await withTimeout(
      () => options.executor.execute(task, workspacePath, sessionId),
      task.limits?.timeoutMs,
      () => options.executor.cancel?.(sessionId),
    );
  } catch (cause) {
    timedOut = cause instanceof EvaluationTimeoutError;
    error = cause instanceof Error ? cause.message : String(cause);
  }

  if (execution) await writeFile(tracePath, `${JSON.stringify(execution.trace, null, 2)}\n`, 'utf8');
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
  return result;
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

class EvaluationTimeoutError extends Error {}

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
