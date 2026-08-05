/**
 * 合成 ResolvedExecutionPolicy。
 * 叠加顺序：profile → capabilities → model → taskOverrides → userOverrides。
 * 模型不支持 tool_calls 时清空工具表。
 */
import { CAPABILITY_REGISTRY } from "../capabilities/registry.js";
import type { RuntimeCapability } from "../capabilities/types.js";
import type { RuntimeProfile } from "../profiles.js";
import type {
  ResolvedExecutionPolicy,
  RuntimeExecutionRequest,
} from "./types.js";

/**
 * 单个 Profile 在未叠加 capability 或调用方覆盖项时的执行上限。
 *
 * 该表是策略解析的起点；后续层只能按明确的合并规则增减工具或收紧限制。
 */
const PROFILE_DEFAULTS: Record<
  RuntimeProfile,
  { tools: string[]; maxTurns: number; maxToolResultChars: number }
> = {
  general: { tools: [], maxTurns: 30, maxToolResultChars: 8000 },
  coding: {
    tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "TodoWrite"],
    maxTurns: 40,
    maxToolResultChars: 6000,
  },
  office: {
    tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
    maxTurns: 24,
    maxToolResultChars: 4000,
  },
  "office-pptx": {
    tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
    maxTurns: 50,
    maxToolResultChars: 4000,
  },
  "file-organizing": {
    tools: ["Read", "Glob", "Grep"],
    maxTurns: 12,
    maxToolResultChars: 4000,
  },
  mcp: {
    tools: ["Read", "Glob", "Grep"],
    maxTurns: 16,
    maxToolResultChars: 6000,
  },
};

/**
 * 按固定优先级合并 Profile、Capability、模型和调用方覆盖项。
 *
 * `resolutionReasons` 保留每一层的参与记录，供 trace 还原最终策略的来源；
 * 当模型不支持 tool calls 时，任何前层允许的工具都必须被清空。
 */
export function resolveExecutionPolicy(
  request: RuntimeExecutionRequest = {},
): ResolvedExecutionPolicy {
  const profile = request.requestedProfile ?? "general";
  const defaults = PROFILE_DEFAULTS[profile];
  const capabilities = [
    ...new Set(request.capabilities ?? []),
  ].sort() as RuntimeCapability[];
  const reasons = [`profile:${profile}`];
  const allowed = new Set(defaults.tools);
  let maxToolResultChars = defaults.maxToolResultChars;
  for (const capability of capabilities) {
    const fragment = CAPABILITY_REGISTRY[capability];
    for (const tool of fragment.allowedTools) allowed.add(tool);
    maxToolResultChars = Math.min(
      maxToolResultChars,
      fragment.maxToolResultChars ?? maxToolResultChars,
    );
    reasons.push(`capability:${capability}`);
  }
  const model = request.model;
  let maxTurns = defaults.maxTurns;
  if (model?.recommendedMaxTurns) {
    maxTurns = Math.min(maxTurns, model.recommendedMaxTurns);
    reasons.push("model:max-turns");
  }
  // 本地小模型经常没有 tool_calls
  if (model && !model.supportsToolCalls) {
    allowed.clear();
    reasons.push("model:no-tool-calls");
  }
  /**
   * 应用一个覆盖层，并且只允许将轮次和工具输出上限收紧。
   *
   * 这避免任务或用户覆盖意外绕过 Profile 对资源消耗设定的上界。
   */
  function applyOverrides(
    overrides:
      | Partial<NonNullable<RuntimeExecutionRequest["taskOverrides"]>>
      | undefined,
    source: string,
  ): void {
    if (!overrides) return;
    for (const tool of overrides.allowedTools ?? []) allowed.add(tool);
    for (const tool of overrides.disallowedTools ?? []) allowed.delete(tool);
    if (overrides.maxTurns) maxTurns = Math.min(maxTurns, overrides.maxTurns);
    if (overrides.maxToolResultChars)
      maxToolResultChars = Math.min(
        maxToolResultChars,
        overrides.maxToolResultChars,
      );
    reasons.push(source);
  }
  applyOverrides(request.taskOverrides, "task-overrides");
  applyOverrides(request.userOverrides, "user-overrides");
  const workspace = request.workspacePolicy;
  return {
    requestedProfile: profile,
    resolvedProfile: profile,
    capabilities,
    tools: { allowed: [...allowed].sort(), disallowed: [] },
    context: {
      maxEstimatedTokens: model?.contextWindow
        ? Math.min(16_000, Math.floor(model.contextWindow * 0.6))
        : 12_000,
      maxToolResultChars,
      injectProjectContext: "once",
      injectGitStatus: "on-change",
    },
    execution: {
      maxTurns,
      maxInvalidToolRetries: 1,
      maxSameToolRetries: 2,
      allowProfileFallback: profile === "office" || profile === "office-pptx",
    },
    risk: {
      allowNetwork: workspace?.allowNetwork ?? false,
      allowedWritePaths: [...(workspace?.allowedWritePaths ?? [])].sort(),
      destructiveActions: workspace?.destructiveActions ?? "deny",
    },
    resolutionReasons: reasons,
  };
}
