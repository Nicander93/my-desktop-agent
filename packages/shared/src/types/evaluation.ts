import type { AgentRuntimeProfile } from './mcp.js';

/** Immutable, versioned description of a headless evaluation task. */
export interface EvaluationTask {
  schemaVersion: 1;
  id: string;
  version: string;
  title: string;
  prompt: string;
  profile: AgentRuntimeProfile;
  /** Runtime capabilities requested by the task. Resolution begins in PR 3. */
  capabilities: string[];
  workflowId?: string;
  /** Optional collection metadata used by headless benchmark suites. */
  suite?: 'smoke' | 'regression' | 'quality';
  tags?: string[];
  fixture: string;
  verifier: EvaluationVerifier;
  limits?: EvaluationLimits;
}

export interface EvaluationLimits {
  maxTurns?: number;
  timeoutMs?: number;
  maxChangedFiles?: number;
}

export interface EvaluationVerifier {
  commands?: EvaluationCommand[];
  requiredFiles?: string[];
  unchangedPaths?: string[];
  checks?: EvaluationVerifierCheck[];
}

export interface EvaluationCommand {
  command: string;
  args?: string[];
  expectedExitCode?: number;
  timeoutMs?: number;
  stdoutIncludes?: string | string[];
}

export type EvaluationVerifierCheck =
  | { id: string; type: 'file-exists'; path: string; weight?: number }
  | { id: string; type: 'file-contains'; path: string; includes: string | string[]; match?: 'all' | 'any'; weight?: number }
  | { id: string; type: 'snapshot'; path: string; expectedPath: string; weight?: number };

export interface EvaluationVerification {
  passed: boolean;
  checks: EvaluationCheck[];
}

export interface EvaluationCheck {
  id: string;
  passed: boolean;
  evidence: string;
  durationMs: number;
}

export interface EvaluationResult {
  schemaVersion: 1;
  runId: string;
  taskId: string;
  taskVersion: string;
  status: 'passed' | 'failed' | 'error' | 'timeout';
  startedAt: string;
  endedAt: string;
  durationMs: number;
  requestedProfile: AgentRuntimeProfile;
  capabilities: string[];
  model: { model: string; baseURL?: string };
  verifier: EvaluationVerification;
  artifacts: EvaluationArtifacts;
  error?: string;
  failure?: { category: 'agent' | 'environment' | 'verifier' | 'timeout'; reason: string };
}

export interface EvaluationArtifacts {
  workspacePath: string;
  tracePath?: string;
  diffPath: string;
  resultPath: string;
}
