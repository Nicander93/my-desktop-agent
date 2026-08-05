/**
 * 评测任务和 Runtime 共同使用的能力片段名称。
 *
 * 名称必须与 benchmark `task.json` 对齐；它表示 Agent 所需能力，不是 Profile 或模型连接配置。
 */
export type RuntimeCapability =
  | "read-project"
  | "edit-code"
  | "run-tests"
  | "inspect-git-diff"
  | "inspect-spreadsheet"
  | "transform-data"
  | "create-charts"
  | "validate-spreadsheet"
  | "create-pptx"
  | "validate-pptx"
  | "render-preview"
  | "use-mcp";

/**
 * 一个 Capability 合并进 Execution Policy 的策略片段。
 *
 * `requiresToolCalls` 标记任务无法在纯文本模型上执行；Resolver 仍负责在模型不支持工具时给出一致限制。
 */
export interface CapabilityFragment {
  allowedTools: string[];
  maxToolResultChars?: number;
  requiresToolCalls?: boolean;
}
