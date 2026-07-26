/**
 * 无头评测 task/result 契约；schemaVersion 固定为 1，改字段要迁 benchmarks。
 * 执行与校验在 packages/agent-eval，见 benchmarks/README.md。
 */
import type { AgentRuntimeProfile } from './mcp.js';

/** 不可变 task 定义；capabilities 在 runner 里解析成策略 */
export interface EvaluationTask {
  schemaVersion: 1;
  id: string;
  version: string;
  title: string;
  prompt: string;
  profile: AgentRuntimeProfile;
  capabilities: string[];
  workflowId?: string;
  /** benchmark 套件标签，collection 按 suite 筛选 */
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

/** 通过后才算 task 成功；agent 自述完成不算 */
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
  /** 为 true 时，相对路径 args 相对 task.json 所在目录解析（用于 harness 判分脚本，不进 Agent workspace） */
  resolveArgsFromTaskDir?: boolean;
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

/** 单次 run 落盘结构；artifacts 路径相对 outputRoot */
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
