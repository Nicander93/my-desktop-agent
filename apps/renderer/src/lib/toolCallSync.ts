/**
 * ToolCall 与 trace span 双向同步：状态、耗时、流式结果
 */
import type {
  ToolCallPayload,
  ToolResultPayload,
  TraceSpan,
} from "@desktop-agent/shared";
import type { ToolCall } from "@/types/chat";

/** 判断是否仍有等待或运行工具，决定消息流是否应显示为工具执行阶段。 */
function hasActiveTools(toolCalls: ToolCall[]): boolean {
  return toolCalls.some(
    (t) => t.status === "running" || t.status === "pending",
  );
}

/** 按稳定调用 ID 合并更新，保留其他事件已填充的 UI 字段。 */
function upsertToolCall(toolCalls: ToolCall[], entry: ToolCall): ToolCall[] {
  const idx = toolCalls.findIndex((t) => t.id === entry.id);
  if (idx >= 0) {
    const next = [...toolCalls];
    next[idx] = { ...next[idx], ...entry };
    return next;
  }
  return [...toolCalls, entry];
}

/** 解析 trace 时间戳；损坏时间戳退回当前时刻以维持非负实时耗时。 */
function spanStartedAt(span: TraceSpan): number {
  const parsed = Date.parse(span.timestamp);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/** 先按权威 ID、再按 pending 名称、最后按活动同名工具定位待更新调用。 */
function findToolCallIndex(
  toolCalls: ToolCall[],
  toolUseId: string,
  toolName?: string,
): number {
  const byId = toolCalls.findIndex((t) => t.id === toolUseId);
  if (byId >= 0) return byId;

  if (toolName) {
    const byPending = toolCalls.findIndex(
      (t) => t.id.startsWith("pending-") && t.toolName === toolName,
    );
    if (byPending >= 0) return byPending;
  }

  return toolCalls.findIndex(
    (t) =>
      (t.status === "running" || t.status === "pending") &&
      (!toolName || t.toolName === toolName),
  );
}

/**
 * 将单条 trace 工具 span 应用到聊天工具调用状态。
 *
 * 权威 tool_call 会替换同名 pending 占位；缺失前序调用的 tool_result 仍构造完整项，保证回放不丢结果。
 */
export function applyTraceSpanToToolCalls(
  toolCalls: ToolCall[],
  span: TraceSpan,
): ToolCall[] {
  if (span.type === "tool_call") {
    const payload = span.payload as ToolCallPayload | undefined;
    if (!payload?.toolUseId) return toolCalls;

    let next = toolCalls.filter(
      (tc) => !(tc.id.startsWith("pending-") && tc.toolName === payload.name),
    );
    next = upsertToolCall(next, {
      id: payload.toolUseId,
      toolName: payload.name,
      input: payload.input,
      status: "running",
      startedAt: spanStartedAt(span),
    });
    return next;
  }

  if (span.type === "tool_result") {
    const payload = span.payload as ToolResultPayload | undefined;
    if (!payload?.toolUseId) return toolCalls;

    const idx = findToolCallIndex(toolCalls, payload.toolUseId, payload.name);
    if (idx < 0) {
      return upsertToolCall(toolCalls, {
        id: payload.toolUseId,
        toolName: payload.name,
        input: {},
        status: payload.isError ? "error" : "completed",
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
      status: payload.isError ? "error" : "completed",
      durationMs:
        span.durationMs ??
        next[idx].durationMs ??
        (next[idx].startedAt ? Date.now() - next[idx].startedAt! : undefined),
      output: payload.isError
        ? { success: false, error: payload.output }
        : { success: true, data: payload.output },
    };
    return next;
  }

  return toolCalls;
}

/** 将实时 tool_result 同步到已有调用；未知结果不擅自创建项以避免错误归属。 */
export function applyStreamToolResult(
  toolCalls: ToolCall[],
  result: { tool_use_id: string; tool_name?: string; output?: string },
): ToolCall[] {
  const idx = findToolCallIndex(
    toolCalls,
    result.tool_use_id,
    result.tool_name,
  );
  if (idx < 0) return toolCalls;

  const next = [...toolCalls];
  const current = next[idx]!;
  const durationMs =
    current.durationMs ??
    (current.startedAt ? Date.now() - current.startedAt : undefined);
  next[idx] = {
    ...current,
    id: result.tool_use_id,
    toolName: result.tool_name || current.toolName,
    status: "completed",
    durationMs,
    output: { success: true, data: result.output },
  };
  return next;
}

/** 用已持久化 trace 时长补齐 UI 尚未计时的工具，不覆盖实时或已有值。 */
export function enrichToolCallsWithTraceDurations(
  toolCalls: ToolCall[],
  spans?: TraceSpan[],
): ToolCall[] {
  if (!spans?.length) return toolCalls;

  const durations = new Map<string, number>();
  for (const span of spans) {
    if (span.type !== "tool_result" || span.durationMs == null) continue;
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

/** 按 trace 原始顺序批量应用工具事件，以保留状态迁移因果关系。 */
export function syncToolCallsFromTrace(
  toolCalls: ToolCall[],
  spans: TraceSpan[],
): ToolCall[] {
  let synced = toolCalls;
  for (const span of spans) {
    if (span.type === "tool_call" || span.type === "tool_result") {
      synced = applyTraceSpanToToolCalls(synced, span);
    }
  }
  return synced;
}

/** 在流结束时收束遗留活动调用，避免消息历史永久显示运行中。 */
export function finalizeToolCalls(
  toolCalls?: ToolCall[],
): ToolCall[] | undefined {
  if (!toolCalls?.length) return toolCalls;
  return toolCalls.map((tc) => {
    if (tc.status !== "running" && tc.status !== "pending") return tc;
    const durationMs =
      tc.durationMs ?? (tc.startedAt ? Date.now() - tc.startedAt : undefined);
    return { ...tc, status: "completed" as const, durationMs };
  });
}

/** 区分“工具已结束但模型仍在流式生成”与完全结束状态。 */
export function isWaitingForModel(
  toolCalls: ToolCall[],
  isStreaming?: boolean,
): boolean {
  return !!isStreaming && toolCalls.length > 0 && !hasActiveTools(toolCalls);
}
