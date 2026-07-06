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

export interface AgentTrace {
  runId: string;
  spans: TraceSpan[];
  isLive?: boolean;
}

export interface TraceSummary {
  turnCount: number;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  toolCallCount: number;
  model?: string;
  isError?: boolean;
}
