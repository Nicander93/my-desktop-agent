import type { ToolCallPayload, ToolResultPayload, TraceSpan } from '@desktop-agent/shared';
import type { ToolCall } from '@/stores/chatStore';

function hasActiveTools(toolCalls: ToolCall[]): boolean {
  return toolCalls.some((t) => t.status === 'running' || t.status === 'pending');
}

function upsertToolCall(toolCalls: ToolCall[], entry: ToolCall): ToolCall[] {
  const idx = toolCalls.findIndex((t) => t.id === entry.id);
  if (idx >= 0) {
    const next = [...toolCalls];
    next[idx] = { ...next[idx], ...entry };
    return next;
  }
  return [...toolCalls, entry];
}

function spanStartedAt(span: TraceSpan): number {
  const parsed = Date.parse(span.timestamp);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function findToolCallIndex(toolCalls: ToolCall[], toolUseId: string, toolName?: string): number {
  const byId = toolCalls.findIndex((t) => t.id === toolUseId);
  if (byId >= 0) return byId;

  if (toolName) {
    const byPending = toolCalls.findIndex(
      (t) => t.id.startsWith('pending-') && t.toolName === toolName,
    );
    if (byPending >= 0) return byPending;
  }

  return toolCalls.findIndex(
    (t) =>
      (t.status === 'running' || t.status === 'pending') &&
      (!toolName || t.toolName === toolName),
  );
}

export function applyTraceSpanToToolCalls(toolCalls: ToolCall[], span: TraceSpan): ToolCall[] {
  if (span.type === 'tool_call') {
    const payload = span.payload as ToolCallPayload | undefined;
    if (!payload?.toolUseId) return toolCalls;

    let next = toolCalls.filter(
      (tc) => !(tc.id.startsWith('pending-') && tc.toolName === payload.name),
    );
    next = upsertToolCall(next, {
      id: payload.toolUseId,
      toolName: payload.name,
      input: payload.input,
      status: 'running',
      startedAt: spanStartedAt(span),
    });
    return next;
  }

  if (span.type === 'tool_result') {
    const payload = span.payload as ToolResultPayload | undefined;
    if (!payload?.toolUseId) return toolCalls;

    const idx = findToolCallIndex(toolCalls, payload.toolUseId, payload.name);
    if (idx < 0) {
      return upsertToolCall(toolCalls, {
        id: payload.toolUseId,
        toolName: payload.name,
        input: {},
        status: payload.isError ? 'error' : 'completed',
        durationMs: span.durationMs,
        output: payload.isError
          ? { success: false, error: payload.output }
          : { success: true, data: payload.output },
      });
    }

    const next = [...toolCalls];
    next[idx] = {
      ...next[idx],
      id: payload.toolUseId,
      toolName: payload.name,
      status: payload.isError ? 'error' : 'completed',
      durationMs:
        span.durationMs
        ?? next[idx].durationMs
        ?? (next[idx].startedAt ? Date.now() - next[idx].startedAt! : undefined),
      output: payload.isError
        ? { success: false, error: payload.output }
        : { success: true, data: payload.output },
    };
    return next;
  }

  return toolCalls;
}

export function applyStreamToolResult(
  toolCalls: ToolCall[],
  result: { tool_use_id: string; tool_name?: string; output?: string },
): ToolCall[] {
  const idx = findToolCallIndex(toolCalls, result.tool_use_id, result.tool_name);
  if (idx < 0) return toolCalls;

  const next = [...toolCalls];
  const current = next[idx]!;
  const durationMs = current.durationMs ?? (current.startedAt ? Date.now() - current.startedAt : undefined);
  next[idx] = {
    ...current,
    id: result.tool_use_id,
    toolName: result.tool_name || current.toolName,
    status: 'completed',
    durationMs,
    output: { success: true, data: result.output },
  };
  return next;
}

export function enrichToolCallsWithTraceDurations(
  toolCalls: ToolCall[],
  spans?: TraceSpan[],
): ToolCall[] {
  if (!spans?.length) return toolCalls;

  const durations = new Map<string, number>();
  for (const span of spans) {
    if (span.type !== 'tool_result' || span.durationMs == null) continue;
    const payload = span.payload as ToolResultPayload | undefined;
    if (payload?.toolUseId) {
      durations.set(payload.toolUseId, span.durationMs);
    }
  }

  if (durations.size === 0) return toolCalls;

  return toolCalls.map((tc) => {
    if (tc.durationMs != null) return tc;
    const fromTrace = durations.get(tc.id);
    if (fromTrace != null) {
      return { ...tc, durationMs: fromTrace };
    }
    return tc;
  });
}

export function syncToolCallsFromTrace(toolCalls: ToolCall[], spans: TraceSpan[]): ToolCall[] {
  let synced = toolCalls;
  for (const span of spans) {
    if (span.type === 'tool_call' || span.type === 'tool_result') {
      synced = applyTraceSpanToToolCalls(synced, span);
    }
  }
  return synced;
}

export function finalizeToolCalls(toolCalls?: ToolCall[]): ToolCall[] | undefined {
  if (!toolCalls?.length) return toolCalls;
  return toolCalls.map((tc) => {
    if (tc.status !== 'running' && tc.status !== 'pending') return tc;
    const durationMs = tc.durationMs ?? (tc.startedAt ? Date.now() - tc.startedAt : undefined);
    return { ...tc, status: 'completed' as const, durationMs };
  });
}

export function isWaitingForModel(toolCalls: ToolCall[], isStreaming?: boolean): boolean {
  return !!isStreaming && toolCalls.length > 0 && !hasActiveTools(toolCalls);
}
