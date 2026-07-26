/**
 * UI 侧 trace 类型；原始 span 流在 open-agent-sdk，分组逻辑在 trace/groupTrace.ts。
 */
export type TraceSpanType =
  | 'run_start'
  | 'run_end'
  | 'turn_start'
  | 'llm_request'
  | 'llm_response'
  | 'tool_call'
  | 'tool_result'
  | 'compact';

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

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cached_input_tokens?: number;
}

export interface LlmRequestPayload {
  model: string;
  system: string;
  messages: unknown[];
  tools?: unknown[];
  maxTokens?: number;
  thinking?: { type: string; budget_tokens?: number };
  estimatedInputTokens?: number;
}

export interface LlmResponsePayload {
  content: unknown[];
  stopReason?: string | null;
  usage?: TokenUsage;
}

export interface ToolCallPayload {
  toolUseId: string;
  name: string;
  input: unknown;
}

export interface ToolResultPayload {
  toolUseId: string;
  name: string;
  output: string;
  isError: boolean;
  truncated?: boolean;
}

export interface RunStartPayload {
  prompt: unknown;
  model: string;
  cwd: string;
  toolNames: string[];
}

export interface RunEndPayload {
  numTurns: number;
  totalCostUsd?: number;
  usage?: TokenUsage;
  subtype: string;
  isError?: boolean;
}

export interface CompactPayload {
  reason: 'auto' | 'prompt_too_long';
  messageCountBefore: number;
}

export type TraceSpanPayload =
  | LlmRequestPayload
  | LlmResponsePayload
  | ToolCallPayload
  | ToolResultPayload
  | RunStartPayload
  | RunEndPayload
  | CompactPayload
  | Record<string, unknown>;

/** 单轮：一次 LLM 往返 + 本轮工具调用对 */
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

/** 一次 agent run，含多轮 turn */
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

/** 扁平 span 列表，isLive 表示流式未结束 */
export interface AgentTrace {
  runId: string;
  spans: TraceSpan[];
  isLive?: boolean;
}

/** TracePanel 顶部摘要数字 */
export interface TraceSummary {
  turnCount: number;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  toolCallCount: number;
  model?: string;
  isError?: boolean;
}
