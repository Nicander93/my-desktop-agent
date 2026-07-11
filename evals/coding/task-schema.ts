/** Versioned task contract for the headless coding evaluation harness. */
export type EvalSuite = 'smoke' | 'regression' | 'quality';

export interface EvalWorkspace {
  /** Directory copied into a new workspace for every run, relative to the task file. */
  fixture: string;
}

export interface EvalLimits {
  maxTurns?: number;
  timeoutMs?: number;
  maxChangedFiles?: number;
}

export interface CheckBase {
  id: string;
  description?: string;
  /** Relative contribution to outcomeScore. Defaults to 1. */
  weight?: number;
}

export interface FileExistsCheck extends CheckBase {
  type: 'file-exists';
  path: string;
}

export interface FileContainsCheck extends CheckBase {
  type: 'file-contains';
  path: string;
  includes: string | string[];
  match?: 'all' | 'any';
}

export interface CommandCheck extends CheckBase {
  type: 'command';
  command: string;
  args?: string[];
  expectedExitCode?: number;
  timeoutMs?: number;
  stdoutIncludes?: string | string[];
}

export interface SnapshotCheck extends CheckBase {
  type: 'snapshot';
  path: string;
  /** Path relative to the task definition, not the mutable workspace. */
  expectedPath: string;
}

export type EvalCheck = FileExistsCheck | FileContainsCheck | CommandCheck | SnapshotCheck;

export interface EvalTask {
  schemaVersion: 1;
  id: string;
  title: string;
  suite: EvalSuite;
  prompt: string;
  workspace: EvalWorkspace;
  checks: EvalCheck[];
  limits?: EvalLimits;
  tags?: string[];
}

export interface LoadedEvalTask extends EvalTask {
  /** Absolute path of the source JSON file. Kept out of persisted task.json. */
  readonly definitionPath: string;
}

export interface CheckResult {
  id: string;
  type: EvalCheck['type'] | 'changed-files-limit';
  description?: string;
  passed: boolean;
  weight: number;
  evidence: string[];
  durationMs: number;
  /** Full (bounded) command output, retained in result.json for replay. */
  commandOutput?: {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
  };
}

export interface Outcome {
  passed: boolean;
  score: number;
  maxScore: number;
  percentage: number;
}

export type EvalRunStatus = 'pass' | 'fail' | 'timeout' | 'error';

export interface TraceMetrics {
  spans: number;
  turns: number;
  toolCalls: number;
  inputTokens?: number;
  outputTokens?: number;
  totalCostUsd?: number;
}

export interface EvalFailure {
  phase: 'agent' | 'timeout' | 'check' | 'validation' | 'trace';
  reason: string;
  evidence: string[];
}

export interface EvalRunResult {
  schemaVersion: 1;
  runId: string;
  task: Pick<EvalTask, 'id' | 'title' | 'suite' | 'tags'>;
  status: EvalRunStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  workspacePath: string;
  model: {
    presetId: string;
    provider: string;
    model: string;
    baseURL?: string;
  };
  provenance: {
    runnerVersion: string;
    agentRuntimeVersion: string;
    sdkVersion: string;
    nodeVersion: string;
    gitRevision?: string;
    promptSha256: string;
  };
  agent: {
    text?: string;
    error?: string;
    timedOut: boolean;
  };
  metrics: TraceMetrics & { changedFiles: number };
  changedFiles: string[];
  checks: CheckResult[];
  outcome: Outcome;
  failure?: EvalFailure;
  artifacts: {
    taskPath: string;
    traceJsonlPath?: string;
    tracePath?: string;
    eventsJsonlPath: string;
    diffPath: string;
    reportPath: string;
  };
}
