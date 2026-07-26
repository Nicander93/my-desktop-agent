/**
 * 评测 task 与 runtime 共用的 capability 枚举；名称与 benchmarks task.json 对齐。
 */
export type RuntimeCapability =
  | 'read-project'
  | 'edit-code'
  | 'run-tests'
  | 'inspect-git-diff'
  | 'inspect-spreadsheet'
  | 'transform-data'
  | 'create-charts'
  | 'validate-spreadsheet'
  | 'create-pptx'
  | 'validate-pptx'
  | 'render-preview'
  | 'use-mcp';

/** 合并进执行策略的片段；requiresToolCalls 表示必须保留工具调用能力 */
export interface CapabilityFragment {
  allowedTools: string[];
  maxToolResultChars?: number;
  requiresToolCalls?: boolean;
}
