/**
 * AgentTrace 展示：时长、token、span 标签与 JSON 预览
 */
import type {
  AgentTrace,
  TraceRun,
  TraceSpan,
  TraceSummary,
} from "@desktop-agent/shared";
import {
  buildTraceRunFromSpans,
  summarizeTraceRun,
} from "@desktop-agent/shared";

/** 从扁平 AgentTrace 重建对应 run；缺少开始 span 时返回 null 而不构造误导性对象。 */
export function getTraceRunFromAgentTrace(trace: AgentTrace): TraceRun | null {
  return buildTraceRunFromSpans(trace.spans, trace.runId);
}

/** 为 trace 面板派生聚合摘要，统一复用 shared 的统计口径。 */
export function getTraceSummary(trace: AgentTrace): TraceSummary | null {
  const run = getTraceRunFromAgentTrace(trace);
  if (!run) return null;
  return summarizeTraceRun(run);
}

/** 仅当 UI 仍在处理且 run 尚无结束 span 时判定 trace 活跃。 */
export function isTraceActive(
  trace: AgentTrace | null,
  isProcessing?: boolean,
): boolean {
  if (!trace || !isProcessing) return false;
  const run = getTraceRunFromAgentTrace(trace);
  return !run?.endSpan;
}

/** 将毫秒格式化为列表可读的短时长；未知或非正值显示占位。 */
export function formatTraceDuration(ms?: number): string {
  if (ms == null || ms <= 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

/** 将 ISO 时间戳格式化为本地 24 小时制；非法值不传播到 UI。 */
export function formatTraceTime(timestamp?: string): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", { hour12: false });
}

/** 用 k/M 缩写格式化 token 数量，避免摘要标签过长。 */
export function formatTokenCount(count?: number): string {
  if (count == null) return "—";
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(2)}M`;
}

/** 组合 run 摘要为单行标签，实时状态优先提示以免用户误以为已结束。 */
export function formatTraceSummaryLabel(
  summary: TraceSummary,
  isLive?: boolean,
): string {
  const parts: string[] = [];
  if (isLive) {
    parts.push("追踪中");
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
  return parts.join(" · ");
}

/** 为每种共享 span 类型提供稳定中文标签，未知扩展类型原样显示。 */
export function getSpanTypeLabel(type: TraceSpan["type"]): string {
  const labels: Record<TraceSpan["type"], string> = {
    run_start: "Run 开始",
    run_end: "Run 结束",
    turn_start: "Turn 开始",
    llm_request: "LLM 请求",
    llm_response: "LLM 响应",
    tool_call: "工具调用",
    tool_result: "工具结果",
    compact: "上下文压缩",
  };
  return labels[type] ?? type;
}

/** 安全序列化 trace 负载并限制展开长度，循环引用时退回字符串表示。 */
export function stringifyTracePayload(payload: unknown, maxLen = 8000): string {
  try {
    const text = JSON.stringify(payload, null, 2);
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + "\n… [已截断]";
  } catch {
    return String(payload);
  }
}

/** 从 run_start 负载抽取短提示词预览，不暴露完整大对象到摘要区域。 */
export function extractPromptPreview(trace: AgentTrace): string {
  const start = trace.spans.find((s) => s.type === "run_start");
  const prompt = (start?.payload as { prompt?: unknown })?.prompt;
  if (typeof prompt === "string") return prompt.slice(0, 200);
  if (prompt != null) return stringifyTracePayload(prompt, 200);
  return "";
}
