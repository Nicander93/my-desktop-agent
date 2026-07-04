/**
 * Anthropic Messages API Provider
 *
 * Wraps the @anthropic-ai/sdk client. Since our internal format is
 * Anthropic-like, this is mostly a thin pass-through.
 */

import Anthropic from '@anthropic-ai/sdk'
import type {
  LLMProvider,
  CreateMessageParams,
  CreateMessageResponse,
  StreamingChunk,
} from './types.js'

export class AnthropicProvider implements LLMProvider {
  readonly apiType = 'anthropic-messages' as const
  private client: Anthropic

  constructor(opts: { apiKey?: string; baseURL?: string }) {
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
    })
  }

  async createMessage(params: CreateMessageParams): Promise<CreateMessageResponse> {
    const requestParams: Anthropic.MessageCreateParamsNonStreaming = {
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: params.messages as Anthropic.MessageParam[],
      tools: params.tools
        ? (params.tools as Anthropic.Tool[])
        : undefined,
    }

    // Add extended thinking if configured
    if (params.thinking?.type === 'enabled' && params.thinking.budget_tokens) {
      (requestParams as any).thinking = {
        type: 'enabled',
        budget_tokens: params.thinking.budget_tokens,
      }
    }

    const response = await this.client.messages.create(requestParams)

    return {
      content: response.content as CreateMessageResponse['content'],
      stopReason: response.stop_reason || 'end_turn',
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_creation_input_tokens:
          (response.usage as any).cache_creation_input_tokens,
        cache_read_input_tokens:
          (response.usage as any).cache_read_input_tokens,
      },
    }
  }

  async *createStreamingMessage(
    params: CreateMessageParams,
  ): AsyncIterable<StreamingChunk> {
    const requestParams: Anthropic.MessageCreateParamsStreaming = {
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: params.messages as Anthropic.MessageParam[],
      stream: true,
      tools: params.tools
        ? (params.tools as Anthropic.Tool[])
        : undefined,
    }

    if (params.thinking?.type === 'enabled' && params.thinking.budget_tokens) {
      (requestParams as any).thinking = {
        type: 'enabled',
        budget_tokens: params.thinking.budget_tokens,
      }
    }

    const stream = this.client.messages.stream(requestParams)

    // Track accumulated content blocks
    const contentBlocks: Array<{ type: string; [key: string]: any }> = []
    const toolInputs: Record<string, string> = {}
    let currentToolIndex = -1

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        const block = event.content_block
        if (block.type === 'text') {
          contentBlocks.push({ type: 'text', text: '' })
        } else if (block.type === 'thinking') {
          contentBlocks.push({ type: 'thinking', thinking: '' })
        } else if (block.type === 'tool_use') {
          const toolIndex = contentBlocks.length
          contentBlocks.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: '',
          })
          toolInputs[block.id] = ''
          currentToolIndex = toolIndex
          yield {
            type: 'tool_use_start',
            id: block.id,
            name: block.name,
          }
        }
      } else if (event.type === 'content_block_delta') {
        const delta = event.delta
        if (delta.type === 'text_delta') {
          const lastBlock = contentBlocks[contentBlocks.length - 1]
          if (lastBlock?.type === 'text') {
            lastBlock.text += delta.text
          }
          yield { type: 'text_delta', text: delta.text }
        } else if (delta.type === 'thinking_delta') {
          const lastBlock = contentBlocks[contentBlocks.length - 1]
          if (lastBlock?.type === 'thinking') {
            lastBlock.thinking += delta.thinking
          }
          yield { type: 'thinking_delta', thinking: delta.thinking }
        } else if (delta.type === 'input_json_delta') {
          const lastBlock = contentBlocks[contentBlocks.length - 1]
          if (lastBlock?.type === 'tool_use') {
            lastBlock.input += delta.partial_json
          }
          if (currentToolIndex >= 0) {
            const block = contentBlocks[currentToolIndex]
            if (block?.type === 'tool_use') {
              yield {
                type: 'tool_use_input_delta',
                id: block.id,
                input_json_delta: delta.partial_json,
              }
            }
          }
        }
      } else if (event.type === 'message_stop') {
        // Parse tool_use inputs from accumulated JSON strings
        for (const block of contentBlocks) {
          if (block.type === 'tool_use' && typeof block.input === 'string') {
            try {
              block.input = JSON.parse(block.input)
            } catch {
              // Keep as string if not valid JSON
            }
          }
        }

        const finalMessage = await stream.finalMessage()
        yield {
          type: 'message_stop',
          stopReason: finalMessage.stop_reason || 'end_turn',
          usage: {
            input_tokens: finalMessage.usage.input_tokens,
            output_tokens: finalMessage.usage.output_tokens,
            cache_creation_input_tokens:
              (finalMessage.usage as any).cache_creation_input_tokens,
            cache_read_input_tokens:
              (finalMessage.usage as any).cache_read_input_tokens,
          },
          content: contentBlocks as any,
        }
      }
    }
  }
}
