/**
 * OpenAI chat/completions 流式 Provider；超长按 maxChars 头尾截断，trace 保留原文。
 * onTextDelta 供 renderer 逐字显示；tool_calls 分片拼完再 JSON.parse。
 */
import type {
  CreateMessageParams,
  CreateMessageResponse,
  LLMProvider,
  NormalizedContentBlock,
  NormalizedMessageParam,
  NormalizedResponseBlock,
  NormalizedTool,
} from "@codeany/open-agent-sdk";

/** 向 renderer 推送文本 token 增量的可选回调。 */
type TextDeltaHandler = (delta: string) => void;

/** OpenAI chat/completions 请求消息的最小兼容形状。 */
interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | OpenAIContentPart[] | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

/** OpenAI user content 支持的文本与图片部分。 */
type OpenAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/** SSE 流中需要保留的 choices、工具分片和用量字段。 */
interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

/**
 * 将 OpenAI-compatible chat/completions SSE 流适配为 SDK Provider。
 *
 * 工具调用参数可能跨 chunk 分片，必须按服务端 index 拼接后才可解析 JSON；文本增量同时通知 UI 和累积最终响应。
 */
export class StreamingOpenAIProvider implements LLMProvider {
  readonly apiType = "openai-completions" as const;
  private apiKey: string;
  private baseURL: string;
  private onTextDelta?: TextDeltaHandler;

  /** 创建 Provider 并规范化 base URL，避免拼接 endpoint 时出现双斜杠。 */
  constructor(opts: {
    apiKey?: string;
    baseURL?: string;
    onTextDelta?: TextDeltaHandler;
  }) {
    this.apiKey = opts.apiKey || "";
    this.baseURL = (opts.baseURL || "https://api.openai.com/v1").replace(
      /\/$/,
      "",
    );
    this.onTextDelta = opts.onTextDelta;
  }

  /** 更新每个文本增量的实时消费者，不影响已在进行的累积内容。 */
  setOnTextDelta(handler?: TextDeltaHandler): void {
    this.onTextDelta = handler;
  }

  /**
   * 消费完整 SSE 流并返回 SDK 规范化内容块。
   *
   * 非 2xx 错误保留 HTTP status，供上层重试策略区分限流、服务端与配置错误。
   */
  async createMessage(
    params: CreateMessageParams,
  ): Promise<CreateMessageResponse> {
    const messages = this.convertMessages(params.system, params.messages);
    const tools = params.tools ? this.convertTools(params.tools) : undefined;

    const body: Record<string, unknown> = {
      model: params.model,
      max_tokens: params.maxTokens,
      messages,
      stream: true,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      const err = new Error(
        `OpenAI API error: ${response.status} ${response.statusText}: ${errBody}`,
      ) as Error & {
        status?: number;
      };
      err.status = response.status;
      throw err;
    }

    if (!response.body) {
      throw new Error("Response body is empty");
    }

    let textContent = "";
    const toolCalls = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    let finishReason = "stop";
    let usage = { input_tokens: 0, output_tokens: 0 };

    for await (const chunk of this.parseSSE(response.body)) {
      if (chunk.usage) {
        usage = {
          input_tokens: chunk.usage.prompt_tokens || 0,
          output_tokens: chunk.usage.completion_tokens || 0,
        };
      }

      const choice = chunk.choices?.[0];
      if (!choice) continue;

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }

      const deltaContent = choice.delta?.content;
      if (deltaContent) {
        textContent += deltaContent;
        this.onTextDelta?.(deltaContent);
      }

      const deltaToolCalls = choice.delta?.tool_calls;
      if (deltaToolCalls) {
        for (const toolCall of deltaToolCalls) {
          const current = toolCalls.get(toolCall.index) || {
            id: toolCall.id || "",
            name: toolCall.function?.name || "",
            arguments: "",
          };
          if (toolCall.id) current.id = toolCall.id;
          if (toolCall.function?.name) current.name = toolCall.function.name;
          if (toolCall.function?.arguments)
            current.arguments += toolCall.function.arguments;
          toolCalls.set(toolCall.index, current);
        }
      }
    }

    const content: NormalizedResponseBlock[] = [];
    if (textContent) {
      content.push({ type: "text", text: textContent });
    }

    for (const toolCall of toolCalls.values()) {
      let input: unknown;
      try {
        input = JSON.parse(toolCall.arguments);
      } catch {
        input = toolCall.arguments;
      }
      content.push({
        type: "tool_use",
        id: toolCall.id,
        name: toolCall.name,
        input,
      });
    }

    if (content.length === 0) {
      content.push({ type: "text", text: "" });
    }

    return {
      content,
      stopReason: this.mapFinishReason(finishReason),
      usage,
    };
  }

  /** 按 SSE 行边界解析 JSON chunk；畸形单条事件忽略，不中断后续有效增量。 */
  private async *parseSSE(
    body: ReadableStream<Uint8Array>,
  ): AsyncGenerator<OpenAIStreamChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;

        try {
          yield JSON.parse(data) as OpenAIStreamChunk;
        } catch {
          // ignore malformed chunks
        }
      }
    }
  }

  /** 将 SDK transcript 转为 OpenAI role 消息，并把 system 始终置于首位。 */
  private convertMessages(
    system: string,
    messages: NormalizedMessageParam[],
  ): OpenAIChatMessage[] {
    const result: OpenAIChatMessage[] = [];
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

  /** 转换用户文本、图片和工具结果；工具结果必须拆为独立 `tool` role。 */
  private convertUserMessage(
    msg: NormalizedMessageParam,
    result: OpenAIChatMessage[],
  ): void {
    if (typeof msg.content === "string") {
      result.push({ role: "user", content: msg.content });
      return;
    }

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

    for (const tr of toolResults) {
      result.push({
        role: "tool",
        tool_call_id: tr.tool_use_id,
        content: tr.content,
      });
    }

    if (contentParts.length > 0) {
      result.push({ role: "user", content: contentParts });
    }
  }

  /** 将 SDK 图片源转换为 OpenAI 接受的 data URL 或远程 URL。 */
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

  /** 转换 assistant 历史及工具调用，确保工具参数以 JSON 字符串重放。 */
  private convertAssistantMessage(
    msg: NormalizedMessageParam,
    result: OpenAIChatMessage[],
  ): void {
    if (typeof msg.content === "string") {
      result.push({ role: "assistant", content: msg.content });
      return;
    }

    const textParts: string[] = [];
    const toolCalls: OpenAIChatMessage["tool_calls"] = [];

    for (const block of msg.content) {
      if (block.type === "text") {
        textParts.push(block.text);
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

    if (toolCalls.length > 0) {
      assistantMsg.tool_calls = toolCalls;
    }

    result.push(assistantMsg);
  }

  /** 适配 SDK 工具 schema 到 OpenAI function tool 格式。 */
  private convertTools(tools: NormalizedTool[]) {
    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
  }

  /** 归一化 OpenAI finish_reason，其他厂商扩展值原样保留供上层诊断。 */
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
}
