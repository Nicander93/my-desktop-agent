import type { AgentTrace, TraceRun, TraceSpan, TraceSummary } from '@desktop-agent/shared';
import { buildTraceRunFromSpans, summarizeTraceRun } from '@desktop-agent/shared';

export function getTraceRunFromAgentTrace(trace: AgentTrace): TraceRun | null {
  return buildTraceRunFromSpans(trace.spans, trace.runId);
}

export function getTraceSummary(trace: AgentTrace): TraceSummary | null {
  const run = getTraceRunFromAgentTrace(trace);
  if (!run) return null;
  return summarizeTraceRun(run);
}

export function isTraceActive(trace: AgentTrace | null, isProcessing?: boolean): boolean {
  if (!trace || !isProcessing) return false;
  const run = getTraceRunFromAgentTrace(trace);
  return !run?.endSpan;
}

export function formatTraceDuration(ms?: number): string {
  if (ms == null || ms <= 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

export function formatTraceTime(timestamp?: string): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', { hour12: false });
}

export function formatTokenCount(count?: number): string {
  if (count == null) return '—';
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(2)}M`;
}

export function formatTraceSummaryLabel(summary: TraceSummary, isLive?: boolean): string {
  const parts: string[] = [];
  if (isLive) {
    parts.push('追踪中');
  }
  parts.push(`${summary.turnCount} 轮`);
  if (summary.durationMs) parts.push(formatTraceDuration(summary.durationMs));
  if (summary.inputTokens != null || summary.outputTokens != null) {
    const inTok = formatTokenCount(summary.inputTokens);
    const outTok = formatTokenCount(summary.outputTokens);
    parts.push(`${inTok} → ${outTok} tokens`);
  }
  if (summary.toolCallCount > 0) {
    parts.push(`${summary.toolCallCount} 次工具`);
  }
  return parts.join(' · ');
}

export function getSpanTypeLabel(type: TraceSpan['type']): string {
  const labels: Record<TraceSpan['type'], string> = {
    run_start: 'Run 开始',
    run_end: 'Run 结束',
    turn_start: 'Turn 开始',
    llm_request: 'LLM 请求',
    llm_response: 'LLM 响应',
    tool_call: '工具调用',
    tool_result: '工具结果',
    compact: '上下文压缩',
  };
  return labels[type] ?? type;
}

export function stringifyTracePayload(payload: unknown, maxLen = 8000): string {
  try {
    const text = JSON.stringify(payload, null, 2);
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '\n… [已截断]';
  } catch {
    return String(payload);
  }
}

export function extractPromptPreview(trace: AgentTrace): string {
  const start = trace.spans.find((s) => s.type === 'run_start');
  const prompt = (start?.payload as { prompt?: unknown })?.prompt;
  if (typeof prompt === 'string') return prompt.slice(0, 200);
  if (prompt != null) return stringifyTracePayload(prompt, 200);
  return '';
}
