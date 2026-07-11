import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { AgentRuntime, type RuntimeOptions } from '@desktop-agent/agent-runtime';
import { calculateOutcome, runChecks, runCommand } from './checkers.js';
import { classifyFailure } from './failure.js';
import type { EvalModelPreset } from './model-presets.js';
import { renderRunSummary, renderTaskReport } from './report.js';
import type { CheckResult, EvalRunResult, EvalRunStatus, LoadedEvalTask } from './task-schema.js';
import { getTaskDirectory } from './tasks.js';
import { copyWorkspace, findChangedFiles, resolveWithin, snapshotDirectory } from './workspace.js';

export interface EvalTraceSpan {
  type: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AgentExecutionResult {
  text: string;
  traceSpans: EvalTraceSpan[];
}

export interface AgentExecutor {
  execute(input: { task: LoadedEvalTask; workspacePath: string; sessionId: string }): Promise<AgentExecutionResult>;
  cancel?(sessionId: string): Promise<void>;
}

export class RuntimeAgentExecutor implements AgentExecutor {
  private readonly activeRuntimes = new Map<string, AgentRuntime>();

  constructor(private readonly options: RuntimeOptions) {}

  async execute(input: { task: LoadedEvalTask; workspacePath: string; sessionId: string }): Promise<AgentExecutionResult> {
    const runtime = new AgentRuntime({
      ...this.options,
      maxTurns: input.task.limits?.maxTurns ?? this.options.maxTurns,
    });
    this.activeRuntimes.set(input.sessionId, runtime);
    const subprocessEnv = createSanitizedSubprocessEnv();
    try {
      const text = await runtime.prompt(
        input.sessionId,
        input.task.prompt,
        { cwd: input.workspacePath, subprocessEnv },
        { profile: 'coding', subprocessEnv },
      );
      const agent = runtime.getAgent(input.sessionId);
      return { text, traceSpans: (agent?.getTrace() ?? []) as unknown as EvalTraceSpan[] };
    } finally {
      this.activeRuntimes.delete(input.sessionId);
      await runtime.close(input.sessionId);
    }
  }

  async cancel(sessionId: string): Promise<void> {
    const runtime = this.activeRuntimes.get(sessionId);
    if (!runtime) return;
    const agent = runtime.getAgent(sessionId);
    await agent?.interrupt();
    await runtime.close(sessionId);
  }
}

export interface RunTaskOptions {
  task: LoadedEvalTask;
  runDirectory: string;
  model: EvalModelPreset;
  executor: AgentExecutor;
  keepWorkspace?: boolean;
}

export interface RunTasksOptions {
  tasks: LoadedEvalTask[];
  runsRoot: string;
  model: EvalModelPreset;
  executor: AgentExecutor;
  keepWorkspace?: boolean;
}

export async function runTasks(options: RunTasksOptions): Promise<{ runDirectory: string; results: EvalRunResult[] }> {
  const runDirectory = join(options.runsRoot, createRunId());
  await mkdir(runDirectory, { recursive: true });
  const results: EvalRunResult[] = [];
  for (const task of options.tasks) {
    results.push(await runTask({
      task,
      runDirectory,
      model: options.model,
      executor: options.executor,
      keepWorkspace: options.keepWorkspace,
    }));
  }
  await writeFile(join(runDirectory, 'summary.md'), renderRunSummary(results), 'utf8');
  return { runDirectory, results };
}

export async function runTask(options: RunTaskOptions): Promise<EvalRunResult> {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const taskDirectory = join(options.runDirectory, options.task.id);
  const workspacePath = join(taskDirectory, 'workspace');
  const baselinePath = join(taskDirectory, 'baseline');
  const taskSourceDirectory = getTaskDirectory(options.task);
  const tasksRoot = dirname(taskSourceDirectory);
  const fixturePath = resolveWithin(tasksRoot, relative(tasksRoot, resolve(taskSourceDirectory, options.task.workspace.fixture)));
  await mkdir(taskDirectory, { recursive: true });
  await copyWorkspace(fixturePath, baselinePath);
  await copyWorkspace(fixturePath, workspacePath);
  await writeFile(join(taskDirectory, 'task.json'), `${JSON.stringify(stripTaskPath(options.task), null, 2)}\n`, 'utf8');

  const sessionId = `eval-${options.task.id}-${randomUUID()}`;
  let execution: AgentExecutionResult | undefined;
  let agentError: string | undefined;
  let timedOut = false;
  try {
    execution = await runWithTimeout(options.executor, {
      task: options.task,
      workspacePath,
      sessionId,
    }, options.task.limits?.timeoutMs);
  } catch (error) {
    if (error instanceof EvalTimeoutError) {
      timedOut = true;
    } else {
      agentError = error instanceof Error ? error.message : String(error);
    }
  }

  const after = await snapshotDirectory(workspacePath);
  const before = await snapshotDirectory(baselinePath);
  const changedFiles = findChangedFiles(before, after);
  const checkResults = await runChecks(options.task.checks, {
    workspacePath,
    taskDirectory: taskSourceDirectory,
    tasksRoot,
  });
  appendChangedFilesCheck(checkResults, options.task.limits?.maxChangedFiles, changedFiles.length);
  const outcome = calculateOutcome(checkResults);
  const traceSpans = execution?.traceSpans ?? [];
  const tracePaths = await writeTraceArtifacts(taskDirectory, traceSpans);
  const diffPath = join(taskDirectory, 'diff.patch');
  await writeFile(diffPath, await createDiff(baselinePath, workspacePath, taskDirectory), 'utf8');
  const status: EvalRunStatus = timedOut ? 'timeout' : agentError ? 'error' : outcome.passed ? 'pass' : 'fail';
  const metrics = { ...summarizeTrace(traceSpans), changedFiles: changedFiles.length };
  const endedAt = new Date().toISOString();
  const eventsJsonlPath = await writeHarnessEvents(taskDirectory, {
    taskId: options.task.id,
    startedAt,
    endedAt,
    traceSpans,
    changedFiles,
    agentError,
    timedOut,
  });
  const result: EvalRunResult = {
    schemaVersion: 1,
    runId: basename(options.runDirectory),
    task: { id: options.task.id, title: options.task.title, suite: options.task.suite, tags: options.task.tags },
    status,
    startedAt,
    endedAt,
    durationMs: Math.round(performance.now() - started),
    workspacePath,
    model: {
      presetId: options.model.id,
      provider: options.model.provider,
      model: options.model.model,
      baseURL: options.model.baseURL,
    },
    provenance: await collectProvenance(options.task.prompt),
    agent: { text: execution?.text, error: agentError, timedOut },
    metrics,
    changedFiles,
    checks: checkResults,
    outcome,
    failure: classifyFailure({ status, agentError, checks: checkResults, metrics }),
    artifacts: {
      taskPath: join(taskDirectory, 'task.json'),
      traceJsonlPath: tracePaths.traceJsonlPath,
      tracePath: tracePaths.tracePath,
      eventsJsonlPath,
      diffPath,
      reportPath: join(taskDirectory, 'report.md'),
    },
  };
  await writeFile(join(taskDirectory, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await writeFile(result.artifacts.reportPath, renderTaskReport(result), 'utf8');
  return result;
}

class EvalTimeoutError extends Error {}

async function runWithTimeout(
  executor: AgentExecutor,
  input: { task: LoadedEvalTask; workspacePath: string; sessionId: string },
  timeoutMs?: number,
): Promise<AgentExecutionResult> {
  if (!timeoutMs) return executor.execute(input);
  const run = executor.execute(input);
  // The losing promise is observed so an eventual provider error is not reported as unhandled.
  void run.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    try {
      return await Promise.race([
        run,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new EvalTimeoutError(`Timed out after ${timeoutMs}ms.`)), timeoutMs);
        }),
      ]);
    } catch (error) {
      if (!(error instanceof EvalTimeoutError)) throw error;
      await executor.cancel?.(input.sessionId);
      await waitForSettlement(run, 5_000);
      throw error;
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function waitForSettlement(run: Promise<unknown>, graceMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    run.then(() => undefined, () => undefined),
    new Promise<void>((resolveGrace) => { timer = setTimeout(resolveGrace, graceMs); }),
  ]);
  if (timer) clearTimeout(timer);
}

/** Override secret-like variables so tools cannot inherit provider credentials. */
function createSanitizedSubprocessEnv(): Record<string, string> {
  const sensitiveName = /(api[_-]?key|token|secret|password|credential)/i;
  return Object.fromEntries(Object.keys(process.env)
    .filter((key) => sensitiveName.test(key))
    .map((key) => [key, '']));
}

function appendChangedFilesCheck(checks: CheckResult[], maxChangedFiles: number | undefined, changedFiles: number): void {
  if (maxChangedFiles === undefined) return;
  checks.push({
    id: 'changed-files-limit',
    type: 'changed-files-limit',
    passed: changedFiles <= maxChangedFiles,
    weight: 1,
    evidence: [`Changed ${changedFiles} file(s); maximum is ${maxChangedFiles}.`],
    durationMs: 0,
  });
}

async function writeTraceArtifacts(taskDirectory: string, traceSpans: EvalTraceSpan[]): Promise<{ traceJsonlPath?: string; tracePath?: string }> {
  if (traceSpans.length === 0) return {};
  const traceJsonlPath = join(taskDirectory, 'trace.jsonl');
  const tracePath = join(taskDirectory, 'trace.json');
  await writeFile(traceJsonlPath, `${traceSpans.map((span) => JSON.stringify(span)).join('\n')}\n`, 'utf8');
  await writeFile(tracePath, `${JSON.stringify(traceSpans, null, 2)}\n`, 'utf8');
  return { traceJsonlPath, tracePath };
}

async function writeHarnessEvents(taskDirectory: string, input: {
  taskId: string;
  startedAt: string;
  endedAt: string;
  traceSpans: EvalTraceSpan[];
  changedFiles: string[];
  agentError?: string;
  timedOut: boolean;
}): Promise<string> {
  const events = [
    { type: 'run_start', timestamp: input.startedAt, source: 'harness', payload: { taskId: input.taskId } },
    ...input.traceSpans.map((span) => ({ ...span, source: 'sdk' })),
    ...input.changedFiles.map((path) => ({ type: 'file_change', timestamp: input.endedAt, source: 'harness', payload: { path } })),
    ...(input.agentError ? [{ type: 'error', timestamp: input.endedAt, source: 'harness', payload: { message: input.agentError } }] : []),
    ...(input.timedOut ? [{ type: 'timeout', timestamp: input.endedAt, source: 'harness' }] : []),
    { type: 'run_end', timestamp: input.endedAt, source: 'harness' },
  ];
  const eventsJsonlPath = join(taskDirectory, 'events.jsonl');
  await writeFile(eventsJsonlPath, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8');
  return eventsJsonlPath;
}

function summarizeTrace(traceSpans: EvalTraceSpan[]) {
  const endPayload = traceSpans.filter((span) => span.type === 'run_end').at(-1)?.payload;
  const usage = asRecord(endPayload?.usage);
  return {
    spans: traceSpans.length,
    turns: traceSpans.filter((span) => span.type === 'turn_start').length,
    toolCalls: traceSpans.filter((span) => span.type === 'tool_call').length,
    inputTokens: asNumber(usage?.input_tokens),
    outputTokens: asNumber(usage?.output_tokens),
    totalCostUsd: asNumber(endPayload?.totalCostUsd),
  };
}

async function createDiff(before: string, after: string, cwd: string): Promise<string> {
  try {
    const diff = await runCommand('git', ['diff', '--no-index', '--no-ext-diff', '--binary', '--', before, after], cwd, 30_000);
    if (diff.stdout) return diff.stdout;
    if (diff.stderr) return `# Unable to generate diff\n${diff.stderr}\n`;
  } catch (error) {
    return `# Unable to generate diff\n${error instanceof Error ? error.message : String(error)}\n`;
  }
  return '# No workspace changes\n';
}

async function collectProvenance(prompt: string): Promise<EvalRunResult['provenance']> {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const rootPackage = resolve(moduleDirectory, '..', '..', 'package.json');
  const packageJson = JSON.parse(await readFile(rootPackage, 'utf8')) as { version?: string };
  const runtimePackage = JSON.parse(await readFile(resolve(moduleDirectory, '..', '..', 'packages', 'agent-runtime', 'package.json'), 'utf8')) as { version?: string };
  const sdkPackage = JSON.parse(await readFile(resolve(moduleDirectory, '..', '..', 'packages', 'open-agent-sdk', 'package.json'), 'utf8')) as { version?: string };
  const revision = await runCommand('git', ['rev-parse', 'HEAD'], resolve(moduleDirectory, '..', '..'), 5_000)
    .then((result) => result.exitCode === 0 ? result.stdout.trim() : undefined)
    .catch(() => undefined);
  return {
    runnerVersion: packageJson.version ?? 'unknown',
    agentRuntimeVersion: runtimePackage.version ?? 'unknown',
    sdkVersion: sdkPackage.version ?? 'unknown',
    nodeVersion: process.version,
    gitRevision: revision,
    promptSha256: createHash('sha256').update(prompt).digest('hex'),
  };
}

function stripTaskPath(task: LoadedEvalTask) {
  return {
    schemaVersion: task.schemaVersion,
    id: task.id,
    title: task.title,
    suite: task.suite,
    prompt: task.prompt,
    workspace: task.workspace,
    checks: task.checks,
    limits: task.limits,
    tags: task.tags,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function createRunId(): string {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
}
