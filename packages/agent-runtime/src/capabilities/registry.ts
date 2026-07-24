import type { CapabilityFragment, RuntimeCapability } from './types.js';

export const CAPABILITY_REGISTRY: Record<RuntimeCapability, CapabilityFragment> = {
  'read-project': { allowedTools: ['Read', 'Glob', 'Grep'] },
  'edit-code': { allowedTools: ['Write', 'Edit'] },
  'run-tests': { allowedTools: ['Bash'], maxToolResultChars: 6000 },
  'inspect-git-diff': { allowedTools: ['Bash'], maxToolResultChars: 6000 },
  'inspect-spreadsheet': { allowedTools: ['Read', 'Glob', 'Bash'], maxToolResultChars: 4000 },
  'transform-data': { allowedTools: ['Write', 'Edit', 'Bash'], maxToolResultChars: 4000 },
  'create-charts': { allowedTools: ['Write', 'Edit', 'Bash'], maxToolResultChars: 4000 },
  'validate-spreadsheet': { allowedTools: ['Read', 'Bash'], maxToolResultChars: 4000 },
  'create-pptx': { allowedTools: ['Write', 'Edit', 'Bash'], maxToolResultChars: 4000 },
  'validate-pptx': { allowedTools: ['Read', 'Bash'], maxToolResultChars: 4000 },
  'render-preview': { allowedTools: ['Read', 'Bash'], maxToolResultChars: 4000 },
  'use-mcp': { allowedTools: [], requiresToolCalls: true },
};
