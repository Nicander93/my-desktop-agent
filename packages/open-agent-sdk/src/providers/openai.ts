/**
 * OpenAI Chat Completions API Provider
 *
 * Converts between the SDK's internal Anthropic-like message format
 * and OpenAI's Chat Completions API format.
 *
 * Uses native fetch (no openai SDK dependency required).
 */

import type {
  LLMProvider,
  CreateMessageParams,
  CreateMessageResponse,
  NormalizedMessageParam,
  NormalizedContentBlock,
  NormalizedTool,
  NormalizedResponseBlock,
  StreamingChunk,
} from './types.js'

// --------------------------------------------------------------------------
// OpenAI-specific types (minimal, just what we need)
// --------------------------------------------------------------------------

interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | OpenAIContentPart[] | null
  /** DeepSeek reasoner and compatible APIs */
  reasoning_content?: string | null
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
}

type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

interface OpenAIToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, any>
  }
}

interface OpenAIChatResponse {
  id: string
  choices: Array<{
    index: number
    message: {
      role: 'assistant'
      content: string | null
      reasoning_content?: string | null
      tool_calls?: OpenAIToolCall[]
    }
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    prompt_tokens_details?: {
      cached_tokens?: number
    }
  }
}

// --------------------------------------------------------------------------
// OpenAI Streaming types
// --------------------------------------------------------------------------

interface OpenAIStreamChunk {
  id: string
  choices: Array<{
    index: number
    delta: {
      role?: 'assistant'
      content?: string | null
      reasoning_content?: string | null
      tool_calls?: Array<{
        index: number
        id?: string
        type?: 'function'
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    prompt_tokens_details?: {
      cached_tokens?: number
    }
  }
}

// --------------------------------------------------------------------------
// Provider
// --------------------------------------------------------------------------

export class OpenAIProvider implements LLMProvider {
  readonly apiType = 'openai-completions' as const
  private apiKey: string
  private baseURL: string

  constructor(opts: { apiKey?: string; baseURL?: string }) {
    this.apiKey = opts.apiKey || ''
    this.baseURL = (opts.baseURL || 'https://api.openai.com/v1').replace(/\/$/, '')
  }

  async createMessage(params: CreateMessageParams): Promise<CreateMessageResponse> {
    // Convert to OpenAI format
    const messages = this.convertMessages(params.system, params.messages)
    const tools = params.tools ? this.convertTools(params.tools) : undefined

    const body: Record<string, any> = {
      model: params.model,
      max_tokens: params.maxTokens,
      messages,
    }

    if (tools && tools.length > 0) {
      body.tools = tools
    }
    this.applyPromptCache(body, params)

    // Make API call
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      const err: any = new Error(
        `OpenAI API error: ${response.status} ${response.statusText}: ${errBody}`,
      )
      err.status = response.status
      throw err
    }

    const data = (await response.json()) as OpenAIChatResponse

    // Convert response back to normalized format
    return this.convertResponse(data, tools)
  }

  async *createStreamingMessage(
    params: CreateMessageParams,
  ): AsyncIterable<StreamingChunk> {
    const messages = this.convertMessages(params.system, params.messages)
    const tools = params.tools ? this.convertTools(params.tools) : undefined

    const body: Record<string, any> = {
      model: params.model,
      max_tokens: params.maxTokens,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    }

    if (tools && tools.length > 0) {
      body.tools = tools
    }
    this.applyPromptCache(body, params)

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      const err: any = new Error(
        `OpenAI API error: ${response.status} ${response.statusText}: ${errBody}`,
      )
      err.status = response.status
      throw err
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Response body is not readable')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    // Track accumulated state
    let fullReasoning = ''
    let fullContent = ''
    const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map()
    let stopReason: string = 'end_turn'
    let usage: CreateMessageResponse['usage'] = { input_tokens: 0, output_tokens: 0 }

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const data = trimmed.slice(6)
          if (data === '[DONE]') {
            // Build final content blocks
            const content: NormalizedResponseBlock[] = []
            const textToolCall = toolCalls.size === 0
              ? parseTextToolCall(fullContent, tools)
              : undefined

            if (fullReasoning) {
              content.push({ type: 'thinking', thinking: fullReasoning })
            }

            if (fullContent && !textToolCall) {
              content.push({ type: 'text', text: fullContent })
            }

            if (textToolCall) {
              content.push({
                type: 'tool_use',
                id: textToolCall.id,
                name: textToolCall.function.name,
                input: JSON.parse(textToolCall.function.arguments),
              })
              stopReason = 'tool_calls'
            }

            // Sort tool calls by index and add them
            const sortedToolCalls = Array.from(toolCalls.entries()).sort(
              ([a], [b]) => a - b,
            )
            for (const [, tc] of sortedToolCalls) {
              let input: any
              try {
                input = JSON.parse(tc.arguments)
              } catch {
                input = tc.arguments
              }
              content.push({
                type: 'tool_use',
                id: tc.id,
                name: tc.name,
                input,
              })
            }

            if (content.length === 0) {
              content.push({ type: 'text', text: '' })
            }

            yield {
              type: 'message_stop',
              stopReason: this.mapFinishReason(stopReason),
              usage,
              content,
            }
            return
          }

          try {
            const chunk = JSON.parse(data) as OpenAIStreamChunk

            // Handle usage in final chunk
            if (chunk.usage) {
              usage = {
                input_tokens: chunk.usage.prompt_tokens,
                output_tokens: chunk.usage.completion_tokens,
                cached_input_tokens: chunk.usage.prompt_tokens_details?.cached_tokens,
              }
            }

            const choice = chunk.choices?.[0]
            if (!choice) continue

            // Update finish reason
            if (choice.finish_reason) {
              stopReason = choice.finish_reason
            }

            const delta = choice.delta

            // Handle reasoning/thinking (DeepSeek reasoner, etc.)
            if (delta.reasoning_content) {
              fullReasoning += delta.reasoning_content
              yield { type: 'thinking_delta', thinking: delta.reasoning_content }
            }

            // Handle content text
            if (delta.content) {
              fullContent += delta.content
              yield { type: 'text_delta', text: delta.content }
            }

            // Handle tool calls
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (!toolCalls.has(tc.index)) {
                  toolCalls.set(tc.index, {
                    id: tc.id || '',
                    name: tc.function?.name || '',
                    arguments: '',
                  })
                  if (tc.id && tc.function?.name) {
                    yield {
                      type: 'tool_use_start',
                      id: tc.id,
                      name: tc.function.name,
                    }
                  }
                }

                const existing = toolCalls.get(tc.index)!
                if (tc.id) existing.id = tc.id
                if (tc.function?.name) existing.name = tc.function.name
                if (tc.function?.arguments) {
                  existing.arguments += tc.function.arguments
                  yield {
                    type: 'tool_use_input_delta',
                    id: existing.id,
                    input_json_delta: tc.function.arguments,
                  }
                }
              }
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  // --------------------------------------------------------------------------
  // Message Conversion: Internal → OpenAI
  // --------------------------------------------------------------------------

  private convertMessages(
    system: string,
    messages: NormalizedMessageParam[],
  ): OpenAIChatMessage[] {
    const result: OpenAIChatMessage[] = []

    // System prompt as first message
    if (system) {
      result.push({ role: 'system', content: system })
    }

    for (const msg of messages) {
      if (msg.role === 'user') {
        this.convertUserMessage(msg, result)
      } else if (msg.role === 'assistant') {
        this.convertAssistantMessage(msg, result)
      }
    }

    return result
  }

  private convertUserMessage(
    msg: NormalizedMessageParam,
    result: OpenAIChatMessage[],
  ): void {
    if (typeof msg.content === 'string') {
      result.push({ role: 'user', content: msg.content })
      return
    }

    // Content blocks may contain text, image, and/or tool_result blocks.
    const contentParts: OpenAIContentPart[] = []
    const toolResults: Array<{ tool_use_id: string; content: string }> = []

    for (const block of msg.content) {
      if (block.type === 'text') {
        contentParts.push({ type: 'text', text: block.text })
      } else if (block.type === 'image') {
        const url = this.convertImageSource(block.source)
        if (url) {
          contentParts.push({ type: 'image_url', image_url: { url } })
        }
      } else if (block.type === 'tool_result') {
        toolResults.push({
          tool_use_id: block.tool_use_id,
          content: block.content,
        })
      }
    }

    // Tool results become separate tool messages
    for (const tr of toolResults) {
      result.push({
        role: 'tool',
        tool_call_id: tr.tool_use_id,
        content: tr.content,
      })
    }

    // Text and image parts become a user message.
    if (contentParts.length > 0) {
      result.push({ role: 'user', content: contentParts })
    }
  }

  private convertImageSource(source: any): string | null {
    if (!source || typeof source !== 'object') return null
    if (source.type === 'base64' && source.data) {
      const mediaType = source.media_type || source.mediaType || 'image/png'
      return `data:${mediaType};base64,${source.data}`
    }
    if (source.type === 'url' && source.url) {
      return source.url
    }
    return null
  }

  private convertAssistantMessage(
    msg: NormalizedMessageParam,
    result: OpenAIChatMessage[],
  ): void {
    if (typeof msg.content === 'string') {
      result.push({ role: 'assistant', content: msg.content })
      return
    }

    // Extract text, thinking, and tool_use blocks
    const textParts: string[] = []
    let reasoningContent: string | undefined
    const toolCalls: OpenAIToolCall[] = []

    for (const block of msg.content) {
      if (block.type === 'text') {
        textParts.push(block.text)
      } else if (block.type === 'thinking') {
        reasoningContent = block.thinking
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: typeof block.input === 'string'
              ? block.input
              : JSON.stringify(block.input),
          },
        })
      }
    }

    const assistantMsg: OpenAIChatMessage = {
      role: 'assistant',
      content: textParts.length > 0 ? textParts.join('\n') : null,
    }

    if (reasoningContent) {
      assistantMsg.reasoning_content = reasoningContent
    }

    if (toolCalls.length > 0) {
      assistantMsg.tool_calls = toolCalls
    }

    result.push(assistantMsg)
  }

  // --------------------------------------------------------------------------
  // Tool Conversion: Internal → OpenAI
  // --------------------------------------------------------------------------

  private convertTools(tools: NormalizedTool[]): OpenAITool[] {
    return tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }))
  }

  private applyPromptCache(body: Record<string, any>, params: CreateMessageParams): void {
    if (!params.promptCache?.enabled || !this.supportsPromptCacheOptions()) return
    if (params.promptCache.key) {
      body.prompt_cache_key = params.promptCache.key
    }
    if (params.promptCache.retention) {
      body.prompt_cache_retention = params.promptCache.retention
    }
  }

  private supportsPromptCacheOptions(): boolean {
    return this.baseURL === 'https://api.openai.com/v1'
  }

  // --------------------------------------------------------------------------
  // Response Conversion: OpenAI → Internal
  // --------------------------------------------------------------------------

  private convertResponse(data: OpenAIChatResponse, tools?: OpenAITool[]): CreateMessageResponse {
    const choice = data.choices[0]
    if (!choice) {
      return {
        content: [{ type: 'text', text: '' }],
        stopReason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0 },
      }
    }

    const content: NormalizedResponseBlock[] = []
    const message = choice.message as OpenAIChatResponse['choices'][0]['message'] & {
      reasoning_content?: string | null
    }
    const textToolCall = !message.tool_calls?.length && message.content
      ? parseTextToolCall(message.content, tools)
      : undefined

    // Reasoning/thinking first (DeepSeek reasoner)
    if (message.reasoning_content) {
      content.push({ type: 'thinking', thinking: message.reasoning_content })
    }

    // Add text content
    if (message.content && !textToolCall) {
      content.push({ type: 'text', text: message.content })
    }

    if (textToolCall) {
      content.push({
        type: 'tool_use',
        id: textToolCall.id,
        name: textToolCall.function.name,
        input: JSON.parse(textToolCall.function.arguments),
      })
    }

    // Add tool calls
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        let input: any
        try {
          input = JSON.parse(tc.function.arguments)
        } catch {
          input = tc.function.arguments
        }

        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input,
        })
      }
    }

    // If no content at all, add empty text
    if (content.length === 0) {
      content.push({ type: 'text', text: '' })
    }

    // Map finish_reason to our normalized stop reasons
    const stopReason = textToolCall ? 'tool_use' : this.mapFinishReason(choice.finish_reason)

    return {
      content,
      stopReason,
      usage: {
        input_tokens: data.usage?.prompt_tokens || 0,
        output_tokens: data.usage?.completion_tokens || 0,
        cached_input_tokens: data.usage?.prompt_tokens_details?.cached_tokens,
      },
    }
  }

  private mapFinishReason(
    reason: string,
  ): 'end_turn' | 'max_tokens' | 'tool_use' | string {
    switch (reason) {
      case 'stop':
        return 'end_turn'
      case 'length':
        return 'max_tokens'
      case 'tool_calls':
        return 'tool_use'
      default:
        return reason
    }
  }
}

/**
 * Some OpenAI-compatible local servers return a requested tool call as a JSON
 * text block instead of `message.tool_calls`. Accept only a complete JSON
 * object whose name matches one of the tools sent with this request.
 */
function parseTextToolCall(content: string, tools?: OpenAITool[]): OpenAIToolCall | undefined {
  if (!tools?.length) return undefined
  const trimmedContent = content.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmedContent)
  const trimmed = fenced?.[1] ?? trimmedContent
  try {
    const value = JSON.parse(trimmed) as { name?: unknown; arguments?: unknown }
    if (!value || typeof value !== 'object' || typeof value.name !== 'string') return undefined
    if (!tools.some((tool) => tool.function.name === value.name)) return undefined
    if (typeof value.arguments !== 'object' || value.arguments === null || Array.isArray(value.arguments)) return undefined
    return {
      id: `text-tool-${crypto.randomUUID()}`,
      type: 'function',
      function: { name: value.name, arguments: JSON.stringify(value.arguments) },
    }
  } catch {
    return undefined
  }
}
