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

export interface CapabilityFragment {
  allowedTools: string[];
  maxToolResultChars?: number;
  requiresToolCalls?: boolean;
}
