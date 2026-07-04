/**
 * LLM Provider Abstraction Types
 *
 * Defines a provider interface that normalizes API differences between
 * Anthropic Messages API and OpenAI Chat Completions API.
 *
 * Internally the SDK uses Anthropic-like message format as the canonical
 * representation. Providers convert to/from their native API format.
 */

// --------------------------------------------------------------------------
// API Type
// --------------------------------------------------------------------------

export type ApiType = 'anthropic-messages' | 'openai-completions'

// --------------------------------------------------------------------------
// Normalized Request
// --------------------------------------------------------------------------

export interface CreateMessageParams {
  model: string
  maxTokens: number
  system: string
  messages: NormalizedMessageParam[]
  tools?: NormalizedTool[]
  thinking?: { type: string; budget_tokens?: number }
}

/**
 * Normalized message format (Anthropic-like).
 * This is the internal representation used throughout the SDK.
 */
export interface NormalizedMessageParam {
  role: 'user' | 'assistant'
  content: string | NormalizedContentBlock[]
}

export type NormalizedContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  | { type: 'image'; source: any }
  | { type: 'thinking'; thinking: string }

export interface NormalizedTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
}

// --------------------------------------------------------------------------
// Normalized Response
// --------------------------------------------------------------------------

export interface CreateMessageResponse {
  content: NormalizedResponseBlock[]
  stopReason: 'end_turn' | 'max_tokens' | 'tool_use' | string
  usage: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}

export type NormalizedResponseBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: any }

// --------------------------------------------------------------------------
// Streaming Types
// --------------------------------------------------------------------------

export interface StreamingTextDelta {
  type: 'text_delta'
  text: string
}

export interface StreamingThinkingDelta {
  type: 'thinking_delta'
  thinking: string
}

export interface StreamingToolUseStart {
  type: 'tool_use_start'
  id: string
  name: string
}

export interface StreamingToolUseInputDelta {
  type: 'tool_use_input_delta'
  id: string
  input_json_delta: string
}

export interface StreamingMessageStop {
  type: 'message_stop'
  stopReason: CreateMessageResponse['stopReason']
  usage: CreateMessageResponse['usage']
  /** Accumulated content blocks (full response). */
  content: NormalizedResponseBlock[]
}

export type StreamingChunk =
  | StreamingTextDelta
  | StreamingThinkingDelta
  | StreamingToolUseStart
  | StreamingToolUseInputDelta
  | StreamingMessageStop

// --------------------------------------------------------------------------
// Provider Interface
// --------------------------------------------------------------------------

export interface LLMProvider {
  /** The API type this provider implements. */
  readonly apiType: ApiType

  /** Send a message and get a response. */
  createMessage(params: CreateMessageParams): Promise<CreateMessageResponse>

  /**
   * Send a message and stream the response token-by-token.
   * If not implemented, the engine falls back to `createMessage`.
   */
  createStreamingMessage?(
    params: CreateMessageParams,
  ): AsyncIterable<StreamingChunk>
}
