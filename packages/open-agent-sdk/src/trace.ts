/**
 * Agent Trace — observability for the agent loop
 *
 * Records each turn's LLM request/response and tool executions as spans.
 * Persists to trace.jsonl alongside session transcripts for replay.
 */

import { appendFile, readFile, mkdir } from "fs/promises";
import { join } from "path";
import type { TokenUsage } from "./types.js";
import type {
  NormalizedMessageParam,
  NormalizedTool,
  PromptCacheConfig,
} from "./providers/types.js";

// --------------------------------------------------------------------------
// Trace Types
// --------------------------------------------------------------------------

/** 追踪流中可重建 Agent 生命周期的 span 分类。 */
export type TraceSpanType =
  | "run_start"
  | "run_end"
  | "turn_start"
  | "llm_request"
  | "llm_response"
  | "tool_call"
  | "tool_result"
  | "compact";

/** 一条可持久化的追踪事件；`parentId` 保留运行、轮次与工具调用的因果关系。 */
export interface TraceSpan {
  id: string;
  parentId?: string;
  runId: string;
  sessionId: string;
  turn?: number;
  type: TraceSpanType;
  timestamp: string;
  durationMs?: number;
  payload?: TraceSpanPayload;
}

/** 发送给 Provider 的规范化请求快照，用于回放与成本归因。 */
export interface LlmRequestPayload {
  model: string;
  system: string;
  messages: NormalizedMessageParam[];
  tools?: NormalizedTool[];
  maxTokens?: number;
  thinking?: { type: string; budget_tokens?: number };
  promptCache?: PromptCacheConfig;
  estimatedInputTokens?: number;
}

/** Provider 响应及其计费信息的追踪负载。 */
export interface LlmResponsePayload {
  content: unknown[];
  stopReason?: string | null;
  usage?: TokenUsage;
}

/** 模型发起工具调用时记录的稳定调用标识与输入。 */
export interface ToolCallPayload {
  toolUseId: string;
  name: string;
  input: unknown;
}

/** 工具执行结果；可标记已按 trace 配置截断的输出。 */
export interface ToolResultPayload {
  toolUseId: string;
  name: string;
  output: string;
  isError: boolean;
  truncated?: boolean;
}

/** 一个 Agent run 开始时固定的请求与运行环境快照。 */
export interface RunStartPayload {
  prompt: unknown;
  model: string;
  cwd: string;
  toolNames: string[];
  metadata?: Record<string, unknown>;
}

/** 一个 Agent run 结束时的聚合结果与资源消耗。 */
export interface RunEndPayload {
  numTurns: number;
  totalCostUsd?: number;
  usage?: TokenUsage;
  subtype: string;
  isError?: boolean;
}

/** 上下文压缩边界，供回放端解释消息数量变化。 */
export interface CompactPayload {
  reason: "auto" | "prompt_too_long";
  messageCountBefore: number;
}

/** 与 span 类型对应的结构化负载联合。 */
export type TraceSpanPayload =
  | LlmRequestPayload
  | LlmResponsePayload
  | ToolCallPayload
  | ToolResultPayload
  | RunStartPayload
  | RunEndPayload
  | CompactPayload
  | Record<string, unknown>;

/** 追踪记录的启用、落盘和输出截断策略。 */
export interface TraceConfig {
  /** Enable trace recording. Default true when trace option is set. */
  enabled?: boolean;
  /** Persist spans to trace.jsonl. Default true. */
  persist?: boolean;
  /** Truncate large tool outputs in trace. Default 0 (preserve raw output). */
  maxToolOutputChars?: number;
  /** Real-time callback for each recorded span. */
  onSpan?: (span: TraceSpan) => void;
}

/** 从扁平 span 重组出的单轮模型与工具活动。 */
export interface TraceTurn {
  turn: number;
  startedAt: string;
  durationMs?: number;
  llmRequest?: TraceSpan;
  llmResponse?: TraceSpan;
  toolCalls: Array<{
    call: TraceSpan;
    result?: TraceSpan;
  }>;
}

/** 可独立回放的完整 Agent run。 */
export interface TraceRun {
  runId: string;
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  turns: TraceTurn[];
  startSpan?: TraceSpan;
  endSpan?: TraceSpan;
}

// --------------------------------------------------------------------------
// Trace file paths
// --------------------------------------------------------------------------

/** 返回 SDK session 根目录；Windows 兼容 USERPROFILE，其他环境优先 HOME。 */
function getSessionsDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "/tmp";
  return join(home, ".open-agent-sdk", "sessions");
}

/** 计算 session 的 JSONL trace 文件路径。 */
function getTracePath(sessionId: string): string {
  return join(getSessionsDir(), sessionId, "trace.jsonl");
}

/** 计算 session 目录，供写入前确保父目录存在。 */
function getSessionDir(sessionId: string): string {
  return join(getSessionsDir(), sessionId);
}

// --------------------------------------------------------------------------
// TraceRecorder
// --------------------------------------------------------------------------

/**
 * 将 Agent 生命周期记录为可选的内存与 JSONL trace。
 *
 * 持久化失败不能影响正常 Agent 执行，因此写入采用 fire-and-forget；调用方仍可通过内存 span 获取实时观察结果。
 */
export class TraceRecorder {
  private enabled: boolean;
  private persist: boolean;
  private sessionId: string;
  private maxToolOutputChars: number;
  private onSpan?: (span: TraceSpan) => void;
  private spans: TraceSpan[] = [];
  private currentRunId: string | null = null;
  private runStartTime = 0;
  private turnSpanIds = new Map<number, string>();
  private llmRequestSpanIds = new Map<number, string>();
  private toolCallSpanIds = new Map<string, string>();

  /** 创建绑定 session 的 recorder，并兼容布尔形式的简化开关。 */
  constructor(sessionId: string, config: TraceConfig | boolean = true) {
    const cfg: TraceConfig =
      typeof config === "boolean" ? { enabled: config } : config;

    this.sessionId = sessionId;
    this.enabled = cfg.enabled !== false;
    this.persist = cfg.persist !== false;
    this.maxToolOutputChars = cfg.maxToolOutputChars ?? 0;
    this.onSpan = cfg.onSpan;
  }

  /** 判断当前 recorder 是否接受新事件。 */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** 返回 trace 所属的持久化 session ID。 */
  getSessionId(): string {
    return this.sessionId;
  }

  /** 返回活跃 run；run 结束后清空以拒绝悬空事件。 */
  getCurrentRunId(): string | null {
    return this.currentRunId;
  }

  /** 返回 span 快照，避免调用者改写 recorder 内部数组。 */
  getSpans(): TraceSpan[] {
    return [...this.spans];
  }

  /** 按 run 过滤内存 span，便于当前请求的局部诊断。 */
  getSpansForRun(runId: string): TraceSpan[] {
    return this.spans.filter((s) => s.runId === runId);
  }

  /** Load previously persisted spans (e.g. on session resume). */
  loadSpans(spans: TraceSpan[]): void {
    this.spans = [...spans];
  }

  /** 开始 run 并重置上一轮关联索引，返回可用于后续 span 关联的 ID。 */
  startRun(payload: RunStartPayload): string {
    if (!this.enabled) return "";

    const runId = crypto.randomUUID();
    this.currentRunId = runId;
    this.runStartTime = performance.now();
    this.turnSpanIds.clear();
    this.llmRequestSpanIds.clear();
    this.toolCallSpanIds.clear();

    this.record({
      runId,
      type: "run_start",
      payload,
    });

    return runId;
  }

  /** 记录 run 总耗时并关闭活跃上下文，防止后续事件错误归属。 */
  endRun(payload: RunEndPayload): void {
    if (!this.enabled || !this.currentRunId) return;

    const durationMs = Math.round(performance.now() - this.runStartTime);
    this.record({
      runId: this.currentRunId,
      type: "run_end",
      durationMs,
      payload,
    });

    this.currentRunId = null;
  }

  /** 记录轮次边界，作为同轮 LLM 请求和工具调用的父节点。 */
  recordTurnStart(turn: number): TraceSpan | null {
    if (!this.enabled || !this.currentRunId) return null;

    const span = this.record({
      runId: this.currentRunId,
      turn,
      type: "turn_start",
      parentId: this.getRunStartSpanId(),
    });
    this.turnSpanIds.set(turn, span.id);
    return span;
  }

  /** 记录 LLM 请求并保存其 ID，保证响应关联到正确请求。 */
  recordLlmRequest(turn: number, payload: LlmRequestPayload): TraceSpan | null {
    if (!this.enabled || !this.currentRunId) return null;

    const span = this.record({
      runId: this.currentRunId,
      turn,
      type: "llm_request",
      parentId: this.turnSpanIds.get(turn),
      payload,
    });
    this.llmRequestSpanIds.set(turn, span.id);
    return span;
  }

  /** 记录 LLM 响应及 Provider 调用耗时。 */
  recordLlmResponse(
    turn: number,
    payload: LlmResponsePayload,
    durationMs: number,
  ): TraceSpan | null {
    if (!this.enabled || !this.currentRunId) return null;

    return this.record({
      runId: this.currentRunId,
      turn,
      type: "llm_response",
      parentId: this.llmRequestSpanIds.get(turn),
      durationMs,
      payload,
    });
  }

  /** 记录工具调用并以 tool-use ID 建立结果关联。 */
  recordToolCall(turn: number, payload: ToolCallPayload): TraceSpan | null {
    if (!this.enabled || !this.currentRunId) return null;

    const span = this.record({
      runId: this.currentRunId,
      turn,
      type: "tool_call",
      parentId: this.turnSpanIds.get(turn),
      payload,
    });
    this.toolCallSpanIds.set(payload.toolUseId, span.id);
    return span;
  }

  /** 按配置截断工具输出后记录结果，保留是否截断的明确信号。 */
  recordToolResult(
    turn: number,
    payload: ToolResultPayload,
    durationMs: number,
  ): TraceSpan | null {
    if (!this.enabled || !this.currentRunId) return null;

    const output = this.truncateOutput(payload.output);
    const truncated = output !== payload.output;

    return this.record({
      runId: this.currentRunId,
      turn,
      type: "tool_result",
      parentId: this.toolCallSpanIds.get(payload.toolUseId),
      durationMs,
      payload: { ...payload, output, truncated },
    });
  }

  /** 记录压缩边界，使回放不会把上下文裁剪误解为消息丢失。 */
  recordCompact(payload: CompactPayload): TraceSpan | null {
    if (!this.enabled || !this.currentRunId) return null;

    return this.record({
      runId: this.currentRunId,
      type: "compact",
      parentId: this.getRunStartSpanId(),
      payload,
    });
  }

  /** 查找活跃 run 的起始 span，用于无轮次事件的父子关联。 */
  private getRunStartSpanId(): string | undefined {
    if (!this.currentRunId) return undefined;
    return this.spans.find(
      (s) => s.runId === this.currentRunId && s.type === "run_start",
    )?.id;
  }

  /** 在写入 trace 前限制大工具输出；零或负值代表保留原文。 */
  private truncateOutput(output: string): string {
    if (
      this.maxToolOutputChars <= 0 ||
      output.length <= this.maxToolOutputChars
    ) {
      return output;
    }
    return (
      output.slice(0, this.maxToolOutputChars) +
      `\n... [truncated, ${output.length - this.maxToolOutputChars} chars omitted]`
    );
  }

  /** 创建 span、广播实时回调，并在启用时异步追加 JSONL。 */
  private record(
    partial: Omit<TraceSpan, "id" | "sessionId" | "timestamp">,
  ): TraceSpan {
    const span: TraceSpan = {
      id: crypto.randomUUID(),
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      ...partial,
    };

    this.spans.push(span);
    this.onSpan?.(span);

    if (this.persist) {
      appendTraceSpan(this.sessionId, span).catch(() => {});
    }

    return span;
  }
}

// --------------------------------------------------------------------------
// Persistence (trace.jsonl)
// --------------------------------------------------------------------------

/** 将一个 span 追加到 trace.jsonl；JSONL 支持崩溃后逐行恢复。 */
export async function appendTraceSpan(
  sessionId: string,
  span: TraceSpan,
): Promise<void> {
  const dir = getSessionDir(sessionId);
  await mkdir(dir, { recursive: true });
  await appendFile(
    getTracePath(sessionId),
    JSON.stringify(span) + "\n",
    "utf-8",
  );
}

/** 读取 session 的所有 trace；缺失或损坏文件降级为空历史而不阻断恢复。 */
export async function loadSessionTrace(
  sessionId: string,
): Promise<TraceSpan[]> {
  try {
    const content = await readFile(getTracePath(sessionId), "utf-8");
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as TraceSpan);
  } catch {
    return [];
  }
}

/** 从 session 历史中筛选指定 run 的 span。 */
export async function loadSessionTraceByRun(
  sessionId: string,
  runId: string,
): Promise<TraceSpan[]> {
  const spans = await loadSessionTrace(sessionId);
  return spans.filter((s) => s.runId === runId);
}

// --------------------------------------------------------------------------
// Replay helpers
// --------------------------------------------------------------------------

/** 将扁平 span 按 run 重组，供回放与跨请求分析使用。 */
export function groupTraceByRun(spans: TraceSpan[]): TraceRun[] {
  const runIds = [...new Set(spans.map((s) => s.runId))];
  return runIds.map((runId) =>
    buildTraceRun(spans.filter((s) => s.runId === runId)),
  );
}

/** 将单个 run 的 span 按轮次关联请求、响应与工具结果。 */
export function groupTraceByTurn(spans: TraceSpan[]): TraceTurn[] {
  const runSpans = spans;
  const turnNumbers = [
    ...new Set(runSpans.filter((s) => s.turn != null).map((s) => s.turn!)),
  ].sort((a, b) => a - b);

  return turnNumbers.map((turn) => {
    const turnSpans = runSpans.filter((s) => s.turn === turn);
    const llmRequest = turnSpans.find((s) => s.type === "llm_request");
    const llmResponse = turnSpans.find((s) => s.type === "llm_response");
    const toolCallSpans = turnSpans.filter((s) => s.type === "tool_call");
    const toolResultSpans = turnSpans.filter((s) => s.type === "tool_result");

    const toolCalls = toolCallSpans.map((call) => {
      const toolUseId = (call.payload as ToolCallPayload)?.toolUseId;
      const result = toolResultSpans.find(
        (r) => (r.payload as ToolResultPayload)?.toolUseId === toolUseId,
      );
      return { call, result };
    });

    const turnStart = turnSpans.find((s) => s.type === "turn_start");
    const durationMs = sumDuration([llmResponse, ...toolResultSpans]);

    return {
      turn,
      startedAt: turnStart?.timestamp ?? llmRequest?.timestamp ?? "",
      durationMs,
      llmRequest,
      llmResponse,
      toolCalls,
    };
  });
}

/** Replay a session's trace — returns all runs with turns grouped. */
export async function replaySessionTrace(
  sessionId: string,
): Promise<TraceRun[]> {
  const spans = await loadSessionTrace(sessionId);
  return groupTraceByRun(spans);
}

/** 读取并重组单个 run；没有记录时返回 null 而非空壳 run。 */
export async function replayRunTrace(
  sessionId: string,
  runId: string,
): Promise<TraceRun | null> {
  const spans = await loadSessionTraceByRun(sessionId, runId);
  if (spans.length === 0) return null;
  return buildTraceRun(spans);
}

/** 从一个 run 的 span 构建包含派生耗时的回放对象。 */
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

/** 汇总可用 span 耗时；全为零时返回 undefined 以区分未知与瞬时。 */
function sumDuration(spans: (TraceSpan | undefined)[]): number | undefined {
  const total = spans.reduce((acc, s) => acc + (s?.durationMs ?? 0), 0);
  return total > 0 ? total : undefined;
}

/** 将 AgentOptions 的简写 trace 开关归一化为 recorder 可消费的配置。 */
export function resolveTraceConfig(
  trace: boolean | TraceConfig | undefined,
): TraceConfig | null {
  if (trace === undefined || trace === false) return null;
  if (trace === true) return { enabled: true };
  return trace;
}
