import type { ToolCall } from '@/stores/chatStore';

const EXPLORE_TOOLS = new Set(['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch']);
const EDIT_TOOLS = new Set(['Write', 'Edit']);

export function summarizeToolActivityGroups(toolCalls: ToolCall[]): string[] {
  let explored = 0;
  let edited = 0;
  let commands = 0;

  for (const toolCall of toolCalls) {
    if (toolCall.status === 'pending') continue;
    if (EXPLORE_TOOLS.has(toolCall.toolName)) explored += 1;
    else if (EDIT_TOOLS.has(toolCall.toolName)) edited += 1;
    else if (toolCall.toolName === 'Bash') commands += 1;
  }

  const lines: string[] = [];
  if (explored > 0) {
    lines.push(`Explored ${explored} file${explored > 1 ? 's' : ''}`);
  }
  if (edited > 0) {
    lines.push(`Edited ${edited} file${edited > 1 ? 's' : ''}`);
  }
  if (commands > 0) {
    lines.push(`ran ${commands} command${commands > 1 ? 's' : ''}`);
  }

  return lines;
}

export function summarizeToolActivity(toolCalls: ToolCall[]): string {
  const groups = summarizeToolActivityGroups(toolCalls);
  if (groups.length > 0) return groups.join(', ');
  if (toolCalls.length === 0) return '';
  return `${toolCalls.length} actions`;
}

export function formatThoughtDuration(ms?: number): string {
  if (!ms || ms < 1000) return '<1s';
  return `${Math.round(ms / 1000)}s`;
}

export function getThinkingPreview(content: string): string {
  const lines = content.trim().split('\n').filter(Boolean);
  return lines[lines.length - 1] ?? '';
}
