/**
 * OpenAI Chat Completions（native fetch，无 openai 包）。
 * 兼容 reasoning_content / reasoning，以及把 tool_call 写进文本的本地服务。
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
} from "./types.js";

/**
 * OpenAI Chat Completions 协议中的消息表示。
 *
 * 保留 reasoning 和 tool_calls 的兼容字段，以便多轮调用可回传不同兼容服务的推理内容。
 */
interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | OpenAIContentPart[] | null;
  /** DeepSeek reasoner 等：思考内容，需在多轮里回传 */
  reasoning_content?: string | null;
  /** Ollama 兼容思考字段 */
  reasoning?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

/**
 * OpenAI 消息中 SDK 当前支持的多模态内容片段。
 *
 * 其他协议片段不会由转换器构造，避免向兼容端发送其不认识的字段。
 */
type OpenAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/**
 * OpenAI function calling 响应中的工具调用。
 *
 * 参数保留为 JSON 字符串，直到 SDK 在执行前完成宽松解析与权限检查。
 */
interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * 发往 OpenAI Chat Completions 的 function tool 定义。
 */
interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

/**
 * 非流式 Chat Completions 响应中本 Provider 实际读取的字段。
 *
 * 使用最小结构而非 SDK 类型，以继续兼容 OpenAI 兼容服务的额外字段。
 */
interface OpenAIChatResponse {
  id: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string | null;
      reasoning_content?: string | null;
      reasoning?: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
}

/**
 * SSE 流中单个 Chat Completions 数据块的最小结构。
 *
 * 工具调用按 index 增量拼接，因此字段均允许在不同 chunk 中分开抵达。
 */
interface OpenAIStreamChunk {
  id: string;
  choices: Array<{
    index: number;
    delta: {
      role?: "assistant";
      content?: string | null;
      reasoning_content?: string | null;
      reasoning?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: "function";
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
}

/**
 * 将 OpenAI Chat Completions 及兼容端点归一化为 SDK Provider。
 *
 * apiKey 可为空以支持本地无鉴权服务；baseURL 在构造时规范化，避免请求路径出现双斜杠。
 */
export class OpenAIProvider implements LLMProvider {
  readonly apiType = "openai-completions" as const;
  private apiKey: string;
  private baseURL: string;

  /**
   * 保存不会随单个请求变动的鉴权和端点配置。
   *
   * 空 apiKey 不会生成 Authorization 头，调用方可用于 Ollama 等本地兼容服务。
   */
  constructor(opts: { apiKey?: string; baseURL?: string }) {
    this.apiKey = opts.apiKey || "";
    this.baseURL = (opts.baseURL || "https://api.openai.com/v1").replace(
      /\/$/,
      "",
    );
  }

  /**
   * 调用非流式 Chat Completions，并转换为 SDK 标准响应。
   *
   * 非 2xx 状态保留 HTTP status 在 Error 上，供上层重试策略区分可重试失败。
   */
  async createMessage(
    params: CreateMessageParams,
  ): Promise<CreateMessageResponse> {
    // Convert to OpenAI format
    const messages = this.convertMessages(params.system, params.messages);
    const tools = params.tools ? this.convertTools(params.tools) : undefined;

    const body: Record<string, any> = {
      model: params.model,
      max_tokens: params.maxTokens,
      messages,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
    }
    this.applyPromptCache(body, params);

    // Make API call
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      const err: any = new Error(
        `OpenAI API error: ${response.status} ${response.statusText}: ${errBody}`,
      );
      err.status = response.status;
      throw err;
    }

    const data = (await response.json()) as OpenAIChatResponse;

    // Convert response back to normalized format
    return this.convertResponse(data, tools);
  }

  /**
   * 调用 SSE 流式 Chat Completions，并按 SDK 事件模型产出增量内容。
   *
   * 某些本地服务不发送 `[DONE]`，读取结束时仍会生成最终 `message_stop`，避免调用方永久等待。
   */
  async *createStreamingMessage(
    params: CreateMessageParams,
  ): AsyncIterable<StreamingChunk> {
    const messages = this.convertMessages(params.system, params.messages);
    const tools = params.tools ? this.convertTools(params.tools) : undefined;

    const body: Record<string, any> = {
      model: params.model,
      max_tokens: params.maxTokens,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
    }
    this.applyPromptCache(body, params);

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      const err: any = new Error(
        `OpenAI API error: ${response.status} ${response.statusText}: ${errBody}`,
      );
      err.status = response.status;
      throw err;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Response body is not readable");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    // Track accumulated state
    let fullReasoning = "";
    let fullContent = "";
    const toolCalls: Map<
      number,
      { id: string; name: string; arguments: string }
    > = new Map();
    let stopReason: string = "end_turn";
    let usage: CreateMessageResponse["usage"] = {
      input_tokens: 0,
      output_tokens: 0,
    };

    /**
     * 将流中累计的文本、推理和工具调用重建为最终标准响应内容。
     *
     * 工具调用按协议 index 排序，确保增量到达顺序不会影响下一轮消息历史。
     */
    const buildStopContent = (): NormalizedResponseBlock[] => {
      const content: NormalizedResponseBlock[] = [];
      const textToolCall =
        toolCalls.size === 0
          ? parseTextToolCall(fullContent, tools)
          : undefined;

      if (fullReasoning) {
        content.push({ type: "thinking", thinking: fullReasoning });
      }

      if (fullContent && !textToolCall) {
        content.push({ type: "text", text: fullContent });
      }

      if (textToolCall) {
        content.push({
          type: "tool_use",
          id: textToolCall.id,
          name: textToolCall.function.name,
          input: JSON.parse(textToolCall.function.arguments),
        });
        stopReason = "tool_calls";
      }

      const sortedToolCalls = Array.from(toolCalls.entries()).sort(
        ([a], [b]) => a - b,
      );
      for (const [, tc] of sortedToolCalls) {
        const input = parseToolArguments(tc.arguments);
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input,
        });
      }

      if (content.length === 0) {
        content.push({ type: "text", text: "" });
      }
      return content;
    };

    let stopped = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") {
            stopped = true;
            yield {
              type: "message_stop",
              stopReason: this.mapFinishReason(stopReason),
              usage,
              content: buildStopContent(),
            };
            return;
          }

          try {
            const chunk = JSON.parse(data) as OpenAIStreamChunk;

            // Handle usage in final chunk
            if (chunk.usage) {
              usage = {
                input_tokens: chunk.usage.prompt_tokens,
                output_tokens: chunk.usage.completion_tokens,
                cached_input_tokens:
                  chunk.usage.prompt_tokens_details?.cached_tokens,
              };
            }

            const choice = chunk.choices?.[0];
            if (!choice) continue;

            // Update finish reason
            if (choice.finish_reason) {
              stopReason = choice.finish_reason;
            }

            const delta = choice.delta;

            // Handle reasoning/thinking (DeepSeek reasoner, etc.)
            const reasoning = delta.reasoning_content ?? delta.reasoning;
            if (reasoning) {
              fullReasoning += reasoning;
              yield { type: "thinking_delta", thinking: reasoning };
            }

            // Handle content text
            if (delta.content) {
              fullContent += delta.content;
              yield { type: "text_delta", text: delta.content };
            }

            // Handle tool calls
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (!toolCalls.has(tc.index)) {
                  toolCalls.set(tc.index, {
                    id: tc.id || "",
                    name: tc.function?.name || "",
                    arguments: "",
                  });
                  if (tc.id && tc.function?.name) {
                    yield {
                      type: "tool_use_start",
                      id: tc.id,
                      name: tc.function.name,
                    };
                  }
                }

                const existing = toolCalls.get(tc.index)!;
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name = tc.function.name;
                if (tc.function?.arguments) {
                  existing.arguments += tc.function.arguments;
                  yield {
                    type: "tool_use_input_delta",
                    id: existing.id,
                    input_json_delta: tc.function.arguments,
                  };
                }
              }
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }

      // 部分本地服务不发 [DONE]，流结束后仍要交出累积内容
      if (!stopped) {
        yield {
          type: "message_stop",
          stopReason: this.mapFinishReason(stopReason),
          usage,
          content: buildStopContent(),
        };
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 将 SDK system prompt 与归一化历史转换为 OpenAI 消息数组。
   *
   * 工具结果会转成独立 `tool` 消息，不能与普通 user 内容合并。
   */
  private convertMessages(
    system: string,
    messages: NormalizedMessageParam[],
  ): OpenAIChatMessage[] {
    const result: OpenAIChatMessage[] = [];

    // System prompt as first message
    if (system) {
      result.push({ role: "system", content: system });
    }

    for (const msg of messages) {
      if (msg.role === "user") {
        this.convertUserMessage(msg, result);
      } else if (msg.role === "assistant") {
        this.convertAssistantMessage(msg, result);
      }
    }

    return result;
  }

  /**
   * 转换一条 SDK user 消息及其中的图片、文本和工具结果块。
   *
   * OpenAI 要求 tool result 独立携带 `tool_call_id`，因此它们必须先于剩余 user 内容输出。
   */
  private convertUserMessage(
    msg: NormalizedMessageParam,
    result: OpenAIChatMessage[],
  ): void {
    if (typeof msg.content === "string") {
      result.push({ role: "user", content: msg.content });
      return;
    }

    // Content blocks may contain text, image, and/or tool_result blocks.
    const contentParts: OpenAIContentPart[] = [];
    const toolResults: Array<{ tool_use_id: string; content: string }> = [];

    for (const block of msg.content) {
      if (block.type === "text") {
        contentParts.push({ type: "text", text: block.text });
      } else if (block.type === "image") {
        const url = this.convertImageSource(block.source);
        if (url) {
          contentParts.push({ type: "image_url", image_url: { url } });
        }
      } else if (block.type === "tool_result") {
        toolResults.push({
          tool_use_id: block.tool_use_id,
          content: block.content,
        });
      }
    }

    // Tool results become separate tool messages
    for (const tr of toolResults) {
      result.push({
        role: "tool",
        tool_call_id: tr.tool_use_id,
        content: tr.content,
      });
    }

    // Text and image parts become a user message.
    if (contentParts.length > 0) {
      result.push({ role: "user", content: contentParts });
    }
  }

  /**
   * 将 SDK 图片源转换为 OpenAI 接受的 URL 或 data URL。
   *
   * 不识别的源返回 null，由调用方忽略而非构造格式错误的 image_url。
   */
  private convertImageSource(source: any): string | null {
    if (!source || typeof source !== "object") return null;
    if (source.type === "base64" && source.data) {
      const mediaType = source.media_type || source.mediaType || "image/png";
      return `data:${mediaType};base64,${source.data}`;
    }
    if (source.type === "url" && source.url) {
      return source.url;
    }
    return null;
  }

  /**
   * 转换 SDK assistant 消息，并保留推理内容和工具调用以供下一轮回传。
   *
   * Ollama 与 DeepSeek 的推理字段不同，必须根据端点兼容性选择字段名。
   */
  private convertAssistantMessage(
    msg: NormalizedMessageParam,
    result: OpenAIChatMessage[],
  ): void {
    if (typeof msg.content === "string") {
      result.push({ role: "assistant", content: msg.content });
      return;
    }

    // Extract text, thinking, and tool_use blocks
    const textParts: string[] = [];
    let reasoningContent: string | undefined;
    const toolCalls: OpenAIToolCall[] = [];

    for (const block of msg.content) {
      if (block.type === "text") {
        textParts.push(block.text);
      } else if (block.type === "thinking") {
        reasoningContent = block.thinking;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          type: "function",
          function: {
            name: block.name,
            arguments:
              typeof block.input === "string"
                ? block.input
                : JSON.stringify(block.input),
          },
        });
      }
    }

    const assistantMsg: OpenAIChatMessage = {
      role: "assistant",
      content: textParts.length > 0 ? textParts.join("\n") : null,
    };

    if (reasoningContent) {
      if (this.isOllamaCompatible()) assistantMsg.reasoning = reasoningContent;
      else assistantMsg.reasoning_content = reasoningContent;
    }

    if (toolCalls.length > 0) {
      assistantMsg.tool_calls = toolCalls;
    }

    result.push(assistantMsg);
  }

  /**
   * 将 Provider 无关工具 schema 包装为 OpenAI function tool 格式。
   */
  private convertTools(tools: NormalizedTool[]): OpenAITool[] {
    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
  }

  /**
   * 为官方 OpenAI 端点附加可选 Prompt Cache 参数。
   *
   * 兼容端点不发送这些非标准字段，避免因未知参数拒绝整次请求。
   */
  private applyPromptCache(
    body: Record<string, any>,
    params: CreateMessageParams,
  ): void {
    if (!params.promptCache?.enabled || !this.supportsPromptCacheOptions())
      return;
    if (params.promptCache.key) {
      body.prompt_cache_key = params.promptCache.key;
    }
    if (params.promptCache.retention) {
      body.prompt_cache_retention = params.promptCache.retention;
    }
  }

  /**
   * 判断当前端点是否明确支持 OpenAI 的 Prompt Cache 请求字段。
   */
  private supportsPromptCacheOptions(): boolean {
    return this.baseURL === "https://api.openai.com/v1";
  }

  /**
   * 判断端点是否采用 Ollama 的 `reasoning` 字段约定。
   *
   * 判断基于 host 而非完整 URL，兼容本地端口和托管域名。
   */
  private isOllamaCompatible(): boolean {
    return /(^|\.)ollama(?:\.ai)?(?::\d+)?$|127\.0\.0\.1:11434|localhost:11434/i.test(
      new URL(this.baseURL).host,
    );
  }

  /**
   * 将 OpenAI 非流式响应转换为 SDK NormalizedResponseBlock。
   *
   * 同时兼容推理字段与“文本中嵌入 JSON tool call”的非标准本地服务行为。
   */
  private convertResponse(
    data: OpenAIChatResponse,
    tools?: OpenAITool[],
  ): CreateMessageResponse {
    const choice = data.choices[0];
    if (!choice) {
      return {
        content: [{ type: "text", text: "" }],
        stopReason: "end_turn",
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    }

    const content: NormalizedResponseBlock[] = [];
    const message =
      choice.message as OpenAIChatResponse["choices"][0]["message"] & {
        reasoning_content?: string | null;
        reasoning?: string | null;
      };
    const textToolCall =
      !message.tool_calls?.length && message.content
        ? parseTextToolCall(message.content, tools)
        : undefined;

    // Reasoning/thinking first (DeepSeek reasoner)
    const reasoning = message.reasoning_content ?? message.reasoning;
    if (reasoning) {
      content.push({ type: "thinking", thinking: reasoning });
    }

    // Add text content
    if (message.content && !textToolCall) {
      content.push({ type: "text", text: message.content });
    }

    if (textToolCall) {
      content.push({
        type: "tool_use",
        id: textToolCall.id,
        name: textToolCall.function.name,
        input: JSON.parse(textToolCall.function.arguments),
      });
    }

    // Add tool calls
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        const input = parseToolArguments(tc.function.arguments);

        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input,
        });
      }
    }

    // If no content at all, add empty text
    if (content.length === 0) {
      content.push({ type: "text", text: "" });
    }

    // Map finish_reason to our normalized stop reasons
    const stopReason = textToolCall
      ? "tool_use"
      : this.mapFinishReason(choice.finish_reason);

    return {
      content,
      stopReason,
      usage: {
        input_tokens: data.usage?.prompt_tokens || 0,
        output_tokens: data.usage?.completion_tokens || 0,
        cached_input_tokens: data.usage?.prompt_tokens_details?.cached_tokens,
      },
    };
  }

  /**
   * 将 OpenAI finish_reason 映射到 SDK 统一停止原因。
   *
   * 未知值原样保留，以便上层诊断供应商扩展状态。
   */
  private mapFinishReason(
    reason: string,
  ): "end_turn" | "max_tokens" | "tool_use" | string {
    switch (reason) {
      case "stop":
        return "end_turn";
      case "length":
        return "max_tokens";
      case "tool_calls":
        return "tool_use";
      default:
        return reason;
    }
  }

  /**
   * 构造每次请求共用的 HTTP 头。
   *
   * 空 apiKey 时故意省略 Authorization，而不是发送空 Bearer token。
   */
  private buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
    };
  }
}

/**
 * 部分本地兼容服务把 tool_call 写成文本 JSON，而不是 message.tool_calls。
 * 仅当整段是完整 JSON 且 name 落在本次请求的 tools 里才采纳，避免误解析。
 */
function parseTextToolCall(
  content: string,
  tools?: OpenAITool[],
): OpenAIToolCall | undefined {
  if (!tools?.length) return undefined;
  const trimmedContent = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmedContent);
  const trimmed = fenced?.[1] ?? trimmedContent;
  try {
    const value = JSON.parse(trimmed) as {
      name?: unknown;
      arguments?: unknown;
    };
    if (!value || typeof value !== "object" || typeof value.name !== "string")
      return undefined;
    if (!tools.some((tool) => tool.function.name === value.name))
      return undefined;
    if (
      typeof value.arguments !== "object" ||
      value.arguments === null ||
      Array.isArray(value.arguments)
    )
      return undefined;
    return {
      id: `text-tool-${crypto.randomUUID()}`,
      type: "function",
      function: {
        name: value.name,
        arguments: JSON.stringify(value.arguments),
      },
    };
  } catch {
    return undefined;
  }
}

/**
 * 宽松解析工具参数，支持裸 JSON、Markdown code fence 与有限的安全语法修复。
 *
 * 无法确认结构时返回原始文本，由工具 schema 或调用端报告错误，而不是猜测参数语义。
 */
function parseToolArguments(argumentsText: string): unknown {
  const candidates = [
    argumentsText,
    /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(argumentsText.trim())?.[1],
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* try a safe syntactic repair below */
    }
    const repaired = candidate
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
    try {
      return JSON.parse(repaired);
    } catch {
      /* preserve the original below */
    }
  }
  return argumentsText;
}
