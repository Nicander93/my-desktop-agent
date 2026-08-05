/**
 * Trace span 按 turn/run 分组、汇总 token 与工具调用。
 * 原始 span 由 open-agent-sdk 产出；UI 展示结构见 types/trace.ts。
 */
import type {
  RunEndPayload,
  TraceRun,
  TraceSpan,
  TraceSummary,
  TraceTurn,
  TokenUsage,
  AgentTrace,
} from "../types/trace.js";

/**
 * 汇总存在的 span 时长；全为零或缺失时保留 undefined 以区分无计时。
 */
function sumDuration(spans: (TraceSpan | undefined)[]): number | undefined {
  const total = spans.reduce((acc, s) => acc + (s?.durationMs ?? 0), 0);
  return total > 0 ? total : undefined;
}

/** 按 turn 字段分组；无 turn 的 span 不进结果 */
export function groupTraceByTurn(spans: TraceSpan[]): TraceTurn[] {
  const turnNumbers = [
    ...new Set(spans.filter((s) => s.turn != null).map((s) => s.turn!)),
  ].sort((a, b) => a - b);

  return turnNumbers.map((turn) => {
    const turnSpans = spans.filter((s) => s.turn === turn);
    const llmRequest = turnSpans.find((s) => s.type === "llm_request");
    const llmResponse = turnSpans.find((s) => s.type === "llm_response");
    const toolCallSpans = turnSpans.filter((s) => s.type === "tool_call");
    const toolResultSpans = turnSpans.filter((s) => s.type === "tool_result");

    const toolCalls = toolCallSpans.map((call) => {
      const toolUseId = (call.payload as { toolUseId?: string })?.toolUseId;
      const result = toolResultSpans.find(
        (r) => (r.payload as { toolUseId?: string })?.toolUseId === toolUseId,
      );
      return { call, result };
    });

    const turnStart = turnSpans.find((s) => s.type === "turn_start");

    return {
      turn,
      startedAt: turnStart?.timestamp ?? llmRequest?.timestamp ?? "",
      durationMs: sumDuration([llmResponse, ...toolResultSpans]),
      llmRequest,
      llmResponse,
      toolCalls,
    };
  });
}

/**
 * 将同一 run 的有序 span 集合归并为包含开始、结束、轮次和总时长的 TraceRun。
 */
function buildTraceRun(spans: TraceSpan[]): TraceRun {
  const runId = spans[0]?.runId ?? "";
  const sessionId = spans[0]?.sessionId ?? "";
  const startSpan = spans.find((s) => s.type === "run_start");
  const endSpan = spans.find((s) => s.type === "run_end");

  let durationMs: number | undefined;
  if (startSpan && endSpan) {
    durationMs =
      endSpan.durationMs ??
      new Date(endSpan.timestamp).getTime() -
        new Date(startSpan.timestamp).getTime();
  }

  return {
    runId,
    sessionId,
    startedAt: startSpan?.timestamp ?? spans[0]?.timestamp ?? "",
    endedAt: endSpan?.timestamp,
    durationMs,
    startSpan,
    endSpan,
    turns: groupTraceByTurn(spans),
  };
}

/** 按 runId 拆成多条 TraceRun */
export function groupTraceByRun(spans: TraceSpan[]): TraceRun[] {
  const runIds = [...new Set(spans.map((s) => s.runId))];
  return runIds.map((runId) =>
    buildTraceRun(spans.filter((s) => s.runId === runId)),
  );
}

/** 可选 runId 过滤；无 span 时返回 null */
export function buildTraceRunFromSpans(
  spans: TraceSpan[],
  runId?: string,
): TraceRun | null {
  const filtered = runId ? spans.filter((s) => s.runId === runId) : spans;
  if (filtered.length === 0) return null;
  return buildTraceRun(filtered);
}

/**
 * 按字段累加可选 token 用量，保持未出现的缓存用量字段为零或缺失。
 */
function addUsage(
  total: TokenUsage | undefined,
  usage?: TokenUsage,
): TokenUsage | undefined {
  if (!usage) return total;
  if (!total) return { ...usage };
  return {
    input_tokens: total.input_tokens + usage.input_tokens,
    output_tokens: total.output_tokens + usage.output_tokens,
    cache_creation_input_tokens:
      (total.cache_creation_input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0),
    cache_read_input_tokens:
      (total.cache_read_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0),
    cached_input_tokens:
      (total.cached_input_tokens ?? 0) + (usage.cached_input_tokens ?? 0),
  };
}

/** 汇总轮次、耗时、token、工具次数；isError 取自 run_end */
export function summarizeTraceRun(run: TraceRun): TraceSummary {
  let usage: TokenUsage | undefined;
  let toolCallCount = 0;

  for (const turn of run.turns) {
    usage = addUsage(
      usage,
      (turn.llmResponse?.payload as { usage?: TokenUsage })?.usage,
    );
    toolCallCount += turn.toolCalls.length;
  }

  const endPayload = run.endSpan?.payload as RunEndPayload | undefined;
  if (endPayload?.usage) {
    usage = addUsage(usage, endPayload.usage);
  }

  return {
    turnCount: run.turns.length,
    durationMs: run.durationMs,
    inputTokens: usage?.input_tokens,
    outputTokens: usage?.output_tokens,
    toolCallCount,
    model: (run.startSpan?.payload as { model?: string })?.model,
    isError: endPayload?.isError,
  };
}

/** 同 id 覆盖更新，避免流式重复追加 */
export function appendTraceSpan(
  spans: TraceSpan[],
  span: TraceSpan,
): TraceSpan[] {
  const idx = spans.findIndex((s) => s.id === span.id);
  if (idx >= 0) {
    const next = [...spans];
    next[idx] = span;
    return next;
  }
  return [...spans, span];
}

/** 判断 IPC/流消息是否为 trace span 包裹 */
export function isTraceMessage(
  message: unknown,
): message is { type: "trace"; span: TraceSpan } {
  return (
    message != null &&
    typeof message === "object" &&
    (message as { type?: string }).type === "trace" &&
    (message as { span?: unknown }).span != null
  );
}

/** 从消息数组提取并合并 trace；无 span 返回 undefined */
export function collectTraceFromMessages(
  messages: unknown[],
): AgentTrace | undefined {
  let runId = "";
  let spans: TraceSpan[] = [];
  for (const msg of messages) {
    if (isTraceMessage(msg)) {
      runId = msg.span.runId;
      spans = appendTraceSpan(spans, msg.span);
    }
  }
  if (spans.length === 0) return undefined;
  return { runId, spans, isLive: false };
}

/** 合并两段 trace，按 span id 去重 */
export function mergeAgentTrace(
  current?: AgentTrace,
  incoming?: AgentTrace,
): AgentTrace | undefined {
  if (!current && !incoming) return undefined;
  const runId = incoming?.runId || current?.runId || "";
  let spans = current?.spans ?? [];
  for (const span of incoming?.spans ?? []) {
    spans = appendTraceSpan(spans, span);
  }
  return {
    runId,
    spans,
    isLive: incoming?.isLive ?? current?.isLive ?? false,
  };
}

/** TraceRun 树展平回 AgentTrace.span 列表 */
export function traceRunToAgentTrace(run: TraceRun): AgentTrace {
  const spans: TraceSpan[] = [];
  /**
   * 仅追加存在的 span，保留 run 展平后用于流式同步的顺序。
   */
  const push = (span?: TraceSpan) => {
    if (span) spans.push(span);
  };
  push(run.startSpan);
  for (const turn of run.turns) {
    push(turn.llmRequest);
    push(turn.llmResponse);
    for (const toolCall of turn.toolCalls) {
      push(toolCall.call);
      push(toolCall.result);
    }
  }
  push(run.endSpan);
  return { runId: run.runId, spans, isLive: false };
}
