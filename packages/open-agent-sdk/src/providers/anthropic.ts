/**
 * Anthropic Messages API 的 Provider 适配器。
 *
 * SDK 内部消息格式与 Anthropic 接近，因此主要负责 SDK 客户端调用、流式事件归一化和可选缓存/思考字段。
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMProvider,
  CreateMessageParams,
  CreateMessageResponse,
  StreamingChunk,
} from "./types.js";

/**
 * 将 Anthropic SDK 响应实现为统一的 LLMProvider 契约。
 *
 * 重试、工具执行、权限和会话生命周期由 Engine 处理，本类不应引入 Desktop Runtime 策略。
 */
export class AnthropicProvider implements LLMProvider {
  readonly apiType = "anthropic-messages" as const;
  private client: Anthropic;

  /**
   * 使用调用方提供的连接配置创建 Anthropic 客户端。
   *
   * baseURL 可用于兼容端点；鉴权与网络错误保持由 Anthropic SDK 向上抛出。
   */
  constructor(opts: { apiKey?: string; baseURL?: string }) {
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
    });
  }

  /**
   * 发起一次非流式 Messages 请求并转换为 SDK 标准响应。
   *
   * 仅在明确启用且存在预算时附加 extended thinking，避免向不支持的模型发送不完整配置。
   */
  async createMessage(
    params: CreateMessageParams,
  ): Promise<CreateMessageResponse> {
    const requestParams: Anthropic.MessageCreateParamsNonStreaming = {
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: params.messages as Anthropic.MessageParam[],
      tools: params.tools ? (params.tools as Anthropic.Tool[]) : undefined,
    };

    // Add extended thinking if configured
    if (params.thinking?.type === "enabled" && params.thinking.budget_tokens) {
      (requestParams as any).thinking = {
        type: "enabled",
        budget_tokens: params.thinking.budget_tokens,
      };
    }
    this.applyPromptCache(requestParams, params);

    const response = await this.client.messages.create(requestParams);

    return {
      content: response.content as CreateMessageResponse["content"],
      stopReason: response.stop_reason || "end_turn",
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_creation_input_tokens: (response.usage as any)
          .cache_creation_input_tokens,
        cache_read_input_tokens: (response.usage as any)
          .cache_read_input_tokens,
      },
    };
  }

  /**
   * 消费 Anthropic SDK 流并产出统一的文本、推理、工具和最终消息事件。
   *
   * 工具参数在流中先按 JSON 字符串累计，只有 `message_stop` 时尝试解析，避免把不完整 delta 当作有效输入。
   */
  async *createStreamingMessage(
    params: CreateMessageParams,
  ): AsyncIterable<StreamingChunk> {
    const requestParams: Anthropic.MessageCreateParamsStreaming = {
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: params.messages as Anthropic.MessageParam[],
      stream: true,
      tools: params.tools ? (params.tools as Anthropic.Tool[]) : undefined,
    };

    if (params.thinking?.type === "enabled" && params.thinking.budget_tokens) {
      (requestParams as any).thinking = {
        type: "enabled",
        budget_tokens: params.thinking.budget_tokens,
      };
    }
    this.applyPromptCache(requestParams, params);

    const stream = this.client.messages.stream(requestParams);

    // 结束事件需要完整内容；工具输入在增量期间可能不是有效 JSON。
    const contentBlocks: Array<{ type: string; [key: string]: any }> = [];
    const toolInputs: Record<string, string> = {};
    let currentToolIndex = -1;

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        const block = event.content_block;
        if (block.type === "text") {
          contentBlocks.push({ type: "text", text: "" });
        } else if (block.type === "thinking") {
          contentBlocks.push({ type: "thinking", thinking: "" });
        } else if (block.type === "tool_use") {
          const toolIndex = contentBlocks.length;
          contentBlocks.push({
            type: "tool_use",
            id: block.id,
            name: block.name,
            input: "",
          });
          toolInputs[block.id] = "";
          currentToolIndex = toolIndex;
          yield {
            type: "tool_use_start",
            id: block.id,
            name: block.name,
          };
        }
      } else if (event.type === "content_block_delta") {
        const delta = event.delta;
        if (delta.type === "text_delta") {
          const lastBlock = contentBlocks[contentBlocks.length - 1];
          if (lastBlock?.type === "text") {
            lastBlock.text += delta.text;
          }
          yield { type: "text_delta", text: delta.text };
        } else if (delta.type === "thinking_delta") {
          const lastBlock = contentBlocks[contentBlocks.length - 1];
          if (lastBlock?.type === "thinking") {
            lastBlock.thinking += delta.thinking;
          }
          yield { type: "thinking_delta", thinking: delta.thinking };
        } else if (delta.type === "input_json_delta") {
          const lastBlock = contentBlocks[contentBlocks.length - 1];
          if (lastBlock?.type === "tool_use") {
            lastBlock.input += delta.partial_json;
          }
          if (currentToolIndex >= 0) {
            const block = contentBlocks[currentToolIndex];
            if (block?.type === "tool_use") {
              yield {
                type: "tool_use_input_delta",
                id: block.id,
                input_json_delta: delta.partial_json,
              };
            }
          }
        }
      } else if (event.type === "message_stop") {
        // 最终仍无法解析时保留字符串，让后续工具/schema 层给出可诊断的错误。
        for (const block of contentBlocks) {
          if (block.type === "tool_use" && typeof block.input === "string") {
            try {
              block.input = JSON.parse(block.input);
            } catch {
              // Keep as string if not valid JSON
            }
          }
        }

        const finalMessage = await stream.finalMessage();
        yield {
          type: "message_stop",
          stopReason: finalMessage.stop_reason || "end_turn",
          usage: {
            input_tokens: finalMessage.usage.input_tokens,
            output_tokens: finalMessage.usage.output_tokens,
            cache_creation_input_tokens: (finalMessage.usage as any)
              .cache_creation_input_tokens,
            cache_read_input_tokens: (finalMessage.usage as any)
              .cache_read_input_tokens,
          },
          content: contentBlocks as any,
        };
      }
    }
  }

  /**
   * 为启用缓存的请求附加 Anthropic ephemeral cache_control。
   *
   * 该字段是 Anthropic 协议专属映射；通用缓存 key 不直接透传给本 Provider。
   */
  private applyPromptCache(
    requestParams: Record<string, any>,
    params: CreateMessageParams,
  ): void {
    if (!params.promptCache?.enabled) return;
    requestParams.cache_control = {
      type: "ephemeral",
      ...(params.promptCache.ttl === "1h" ? { ttl: "1h" } : {}),
    };
  }
}
