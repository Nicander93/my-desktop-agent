import type { ToolCall } from '@/stores/chatStore';
import { formatTraceDuration } from '@/lib/traceUtils';

const EXPLORE_TOOLS = new Set(['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch']);
const EDIT_TOOLS = new Set(['Write', 'Edit']);

function isActiveStatus(status: ToolCall['status']): boolean {
  return status === 'running' || status === 'pending';
}

export function sumCompletedToolDurationMs(toolCalls: ToolCall[]): number {
  return toolCalls.reduce((acc, tc) => acc + (tc.durationMs ?? 0), 0);
}

export function getActiveTool(toolCalls: ToolCall[]): ToolCall | undefined {
  for (let i = toolCalls.length - 1; i >= 0; i -= 1) {
    if (isActiveStatus(toolCalls[i]!.status)) return toolCalls[i];
  }
  return undefined;
}

export interface ToolActivitySummaryTiming {
  activeElapsedMs?: number;
  modelWaitElapsedMs?: number;
  waitingForModel?: boolean;
}

export function buildToolActivitySummaryLabel(
  toolCalls: ToolCall[],
  timing: ToolActivitySummaryTiming = {},
): string {
  const summary = summarizeToolActivity(toolCalls);
  if (!summary) return '';

  const activeTool = getActiveTool(toolCalls);
  if (activeTool && timing.activeElapsedMs != null) {
    return `${summary} · ${formatTraceDuration(timing.activeElapsedMs)}…`;
  }

  if (timing.waitingForModel && timing.modelWaitElapsedMs != null) {
    return `${summary} · 等待模型 ${formatTraceDuration(timing.modelWaitElapsedMs)}…`;
  }

  const totalDuration = sumCompletedToolDurationMs(toolCalls);
  if (totalDuration > 0 && !activeTool) {
    return `${summary} · ${formatTraceDuration(totalDuration)}`;
  }

  return summary;
}

export function formatToolCallDuration(
  toolCall: ToolCall,
  liveElapsedMs?: number,
): string | undefined {
  if (isActiveStatus(toolCall.status)) {
    if (liveElapsedMs == null) return undefined;
    return `${formatTraceDuration(liveElapsedMs)}…`;
  }
  if (toolCall.durationMs != null && toolCall.durationMs > 0) {
    return formatTraceDuration(toolCall.durationMs);
  }
  return undefined;
}

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
