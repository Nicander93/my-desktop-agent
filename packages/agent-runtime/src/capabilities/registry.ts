/**
 * capability → 工具白名单与 tool result 上限；resolver 按 task/profile 合并。
 * 改条目要同步 agent-eval task capabilities 与 profiles。
 */
import type { CapabilityFragment, RuntimeCapability } from "./types.js";

/**
 * Capability 到工具白名单和上下文上限的稳定映射。
 *
 * Resolver 按 Profile 与任务声明合并这些片段；新增或变更条目时必须同步 benchmark task capabilities 与 Profile 策略。
 */
export const CAPABILITY_REGISTRY: Record<
  RuntimeCapability,
  CapabilityFragment
> = {
  "read-project": { allowedTools: ["Read", "Glob", "Grep"] },
  "edit-code": { allowedTools: ["Write", "Edit"] },
  "run-tests": { allowedTools: ["Bash"], maxToolResultChars: 6000 },
  "inspect-git-diff": { allowedTools: ["Bash"], maxToolResultChars: 6000 },
  "inspect-spreadsheet": {
    allowedTools: ["Read", "Glob", "Bash"],
    maxToolResultChars: 4000,
  },
  "transform-data": {
    allowedTools: ["Write", "Edit", "Bash"],
    maxToolResultChars: 4000,
  },
  "create-charts": {
    allowedTools: ["Write", "Edit", "Bash"],
    maxToolResultChars: 4000,
  },
  "validate-spreadsheet": {
    allowedTools: ["Read", "Bash"],
    maxToolResultChars: 4000,
  },
  "create-pptx": {
    allowedTools: ["Write", "Edit", "Bash"],
    maxToolResultChars: 4000,
  },
  "validate-pptx": { allowedTools: ["Read", "Bash"], maxToolResultChars: 4000 },
  "render-preview": {
    allowedTools: ["Read", "Bash"],
    maxToolResultChars: 4000,
  },
  "use-mcp": { allowedTools: [], requiresToolCalls: true },
};
