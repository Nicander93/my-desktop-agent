/**
 * resolveExecutionPolicy 的输入输出类型。
 * ResolvedExecutionPolicy 会塞进 traceMetadata。
 */
import type { RuntimeCapability } from "../capabilities/types.js";
import type { RuntimeProfile } from "../profiles.js";

/**
 * 会影响执行策略的模型能力摘要。
 *
 * 它描述模型本身而非用户配置的 Model Config；缺省能力必须使用保守策略处理。
 */
export interface ModelCapabilityDescriptor {
  supportsToolCalls: boolean;
  contextWindow?: number;
  recommendedMaxTurns?: number;
}

/**
 * 工作区所有者施加的风险边界。
 *
 * 策略解析只传递这类限制，实际路径校验仍由 Runtime 与 Host 的 pathGuard 执行。
 */
export interface WorkspaceExecutionPolicy {
  allowNetwork?: boolean;
  allowedWritePaths?: string[];
  destructiveActions?: "deny" | "confirm" | "allow";
}

/**
 * 任务或用户对默认策略提出的可选调整。
 *
 * Resolver 将数值上限视为收紧项，并按覆盖来源记录到 trace 中。
 */
export interface ExecutionPolicyOverrides {
  maxTurns?: number;
  maxToolResultChars?: number;
  allowedTools?: string[];
  disallowedTools?: string[];
}

/**
 * 解析一次 Execution Policy 所需的全部输入层。
 *
 * 字段按优先级分别承载 Profile、Capability、模型边界和显式覆盖，而不是相互替代的配置副本。
 */
export interface RuntimeExecutionRequest {
  requestedProfile?: RuntimeProfile;
  capabilities?: RuntimeCapability[];
  model?: ModelCapabilityDescriptor;
  workspacePolicy?: WorkspaceExecutionPolicy;
  taskOverrides?: Partial<ExecutionPolicyOverrides>;
  userOverrides?: Partial<ExecutionPolicyOverrides>;
}

/**
 * 合并后的不可变执行策略快照。
 *
 * Runtime 将其写入 traceMetadata，供评测和问题排查还原某轮 Agent 实际获得的能力与限制。
 */
export interface ResolvedExecutionPolicy {
  requestedProfile: RuntimeProfile;
  resolvedProfile: RuntimeProfile;
  capabilities: RuntimeCapability[];
  tools: { allowed: string[]; disallowed: string[] };
  context: {
    maxEstimatedTokens: number;
    maxToolResultChars: number;
    injectProjectContext: "once" | "each-run";
    injectGitStatus: "never" | "on-change" | "each-run";
  };
  execution: {
    maxTurns: number;
    maxInvalidToolRetries: number;
    maxSameToolRetries: number;
    allowProfileFallback: boolean;
  };
  risk: {
    allowNetwork: boolean;
    allowedWritePaths: string[];
    destructiveActions: "deny" | "confirm" | "allow";
  };
  /**
   * 策略层叠加的来源记录，例如 `profile:coding`、`model:no-tool-calls`。
   */
  resolutionReasons: string[];
}
