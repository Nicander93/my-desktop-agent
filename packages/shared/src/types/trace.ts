/**
 * UI 侧 trace 类型；原始 span 流在 open-agent-sdk，分组逻辑在 trace/groupTrace.ts。
 */
/** 可在 trace JSONL 与 UI 间传输的生命周期事件分类。 */
export type TraceSpanType =
  | "run_start"
  | "run_end"
  | "turn_start"
  | "llm_request"
  | "llm_response"
  | "tool_call"
  | "tool_result"
  | "compact";

/** 一条序列化 span，`parentId` 用于还原 run、turn 与工具调用的因果层级。 */
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

/** 由 Provider 归一化后的 token 用量，包含可选缓存计数。 */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cached_input_tokens?: number;
}

/** LLM 请求的可诊断快照；消息与工具保留为 unknown 以隔离 SDK Provider 细节。 */
export interface LlmRequestPayload {
  model: string;
  system: string;
  messages: unknown[];
  tools?: unknown[];
  maxTokens?: number;
  thinking?: { type: string; budget_tokens?: number };
  estimatedInputTokens?: number;
}

/** LLM 响应内容、终止原因和用量的 trace 负载。 */
export interface LlmResponsePayload {
  content: unknown[];
  stopReason?: string | null;
  usage?: TokenUsage;
}

/** 工具调用 span 的稳定调用 ID、名称与输入。 */
export interface ToolCallPayload {
  toolUseId: string;
  name: string;
  input: unknown;
}

/** 工具结果 span；`truncated` 表示 trace 输出被策略裁剪而非工具原始失败。 */
export interface ToolResultPayload {
  toolUseId: string;
  name: string;
  output: string;
  isError: boolean;
  truncated?: boolean;
}

/** Agent run 开始时固定的提示、模型、工作目录与工具快照。 */
export interface RunStartPayload {
  prompt: unknown;
  model: string;
  cwd: string;
  toolNames: string[];
}

/** Agent run 结束时的轮次、成本、用量与失败标识。 */
export interface RunEndPayload {
  numTurns: number;
  totalCostUsd?: number;
  usage?: TokenUsage;
  subtype: string;
  isError?: boolean;
}

/** 上下文压缩事件，帮助回放端解释历史消息数量变化。 */
export interface CompactPayload {
  reason: "auto" | "prompt_too_long";
  messageCountBefore: number;
}

/** span payload 的已知联合；允许扩展对象以兼容旧 trace。 */
export type TraceSpanPayload =
  | LlmRequestPayload
  | LlmResponsePayload
  | ToolCallPayload
  | ToolResultPayload
  | RunStartPayload
  | RunEndPayload
  | CompactPayload
  | Record<string, unknown>;

/** 单轮 Agent 往返：一次 LLM 请求/响应及其工具调用对。 */
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

/** 可独立回放的一次 Agent run，包含多个有序 turn。 */
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

/** UI 消费的扁平 span 列表；`isLive` 表示该 run 仍可能追加事件。 */
export interface AgentTrace {
  runId: string;
  spans: TraceSpan[];
  isLive?: boolean;
}

/** TracePanel 顶部展示的派生摘要，避免每个消费者重复扫描 span。 */
export interface TraceSummary {
  turnCount: number;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  toolCallCount: number;
  model?: string;
  isError?: boolean;
}
