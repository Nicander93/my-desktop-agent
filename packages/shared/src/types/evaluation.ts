/**
 * 无头评测 task/result 契约；schemaVersion 固定为 1，改字段要迁 benchmarks。
 * 执行与校验在 packages/agent-eval，见 benchmarks/README.md。
 */
import type { AgentRuntimeProfile } from "./mcp.js";

/**
 * 不可变的评测任务定义。
 *
 * Capability 在 Runner 中解析为执行策略；`schemaVersion` 固定为 1，改字段时必须同步迁移 benchmark task 文件。
 */
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
  suite?: "smoke" | "regression" | "quality";
  tags?: string[];
  fixture: string;
  verifier: EvaluationVerifier;
  limits?: EvaluationLimits;
}

/**
 * 单次评测运行的资源与修改范围限制。
 *
 * 这些限制由 Runner 执行，不应依赖 Agent 自己遵守提示文本。
 */
export interface EvaluationLimits {
  maxTurns?: number;
  timeoutMs?: number;
  maxChangedFiles?: number;
  /** 同一次评测 run 中允许根据 Verifier 反馈继续执行的最大次数。 */
  maxAttempts?: number;
}

/**
 * 用于判定任务是否通过的确定性验证规则。
 *
 * 只有全部检查通过才算 task 成功；Agent 自述完成或无异常都不能替代 Verifier 结果。
 */
export interface EvaluationVerifier {
  commands?: EvaluationCommand[];
  requiredFiles?: string[];
  unchangedPaths?: string[];
  checks?: EvaluationVerifierCheck[];
}

/**
 * Verifier 在隔离 workspace 或 task 定义目录执行的命令检查。
 *
 * `resolveArgsFromTaskDir` 仅用于 harness 辅助脚本，不能让 Agent 把受保护输入当作可修改工作区。
 */
export interface EvaluationCommand {
  command: string;
  args?: string[];
  expectedExitCode?: number;
  timeoutMs?: number;
  stdoutIncludes?: string | string[];
  /** 为 true 时，相对路径 args 相对 task.json 所在目录解析（用于 harness 判分脚本，不进 Agent workspace） */
  resolveArgsFromTaskDir?: boolean;
}

/**
 * 不依赖命令执行的文件与快照验证规则。
 *
 * 权重供报告聚合使用，是否通过仍由每条规则的确定性判断决定。
 */
export type EvaluationVerifierCheck =
  | { id: string; type: "file-exists"; path: string; weight?: number }
  | {
      id: string;
      type: "file-contains";
      path: string;
      includes: string | string[];
      match?: "all" | "any";
      weight?: number;
    }
  | {
      id: string;
      type: "snapshot";
      path: string;
      expectedPath: string;
      weight?: number;
    };

/**
 * 一次 Verifier 执行的聚合结果及逐项证据。
 */
export interface EvaluationVerification {
  passed: boolean;
  checks: EvaluationCheck[];
}

/**
 * 单项验证检查的可审计结果。
 *
 * evidence 应保留足以复现失败的摘要，避免报告只显示布尔值而失去诊断依据。
 */
export interface EvaluationCheck {
  id: string;
  passed: boolean;
  evidence: string;
  durationMs: number;
}

/**
 * 同一次 run 中的一轮 Agent 执行与验证结果。
 *
 * 后续 attempt 可以复用 Session 并携带上一轮反馈；它们不是彼此独立的重新评测。
 */
export interface EvaluationAttempt {
  index: number;
  status: "passed" | "failed" | "error" | "timeout";
  startedAt: string;
  endedAt: string;
  durationMs: number;
  verifier: EvaluationVerification;
  error?: string;
}

/**
 * 单次评测 run 写入 result.json 的结构。
 *
 * artifacts 路径相对 outputRoot；attempt 字段可选仅为兼容旧结果，新 Runner 始终写入它们。
 */
export interface EvaluationResult {
  schemaVersion: 1;
  runId: string;
  taskId: string;
  taskVersion: string;
  status: "passed" | "failed" | "error" | "timeout";
  startedAt: string;
  endedAt: string;
  durationMs: number;
  requestedProfile: AgentRuntimeProfile;
  capabilities: string[];
  model: { model: string; baseURL?: string };
  verifier: EvaluationVerification;
  artifacts: EvaluationArtifacts;
  /** 新结果始终写入；可选以兼容历史 result.json。 */
  attemptCount?: number;
  /** 新结果始终写入；可选以兼容历史 result.json。 */
  attempts?: EvaluationAttempt[];
  error?: string;
  failure?: {
    category: "agent" | "environment" | "verifier" | "timeout";
    reason: string;
  };
}

/**
 * 一次评测运行生成的可审计工件路径。
 *
 * workspace、trace 和 diff 互相对应同一 runId，报告工具不能跨运行混合读取。
 */
export interface EvaluationArtifacts {
  workspacePath: string;
  tracePath?: string;
  diffPath: string;
  resultPath: string;
}
