import Anthropic, { APIError, APIUserAbortError } from "@anthropic-ai/sdk";
import {
  createStreamChunk,
  type LLMClient,
  type LLMInput,
  type LLMResponse,
  type LLMStreamChunk,
  type LLMUsage,
} from "@/llm/llm-client.js";
import type {
  AssistantContent,
  AssistantMessage,
  Message,
} from "@/core/message.js";
import { createMessageId } from "@/core/message.js";
import type { ToolDefinition } from "@/core/tool.js";
import {
  toAnthropicThinkingParams,
  type ThinkingConfig,
} from "@/llm/thinking.js";

export interface AnthropicClientOptions {
  baseURL: string;
  model: string;
  apiKey?: string;
  headers?: Readonly<Record<string, string>>;
  maxTokens?: number;
  temperature?: number;
  thinking?: ThinkingConfig;
  fetch?: typeof globalThis.fetch;
}

/**
 * Preserves provider failure details without exposing SDK-specific error types.
 */
export class AnthropicError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly responseBody?: string,
  ) {
    super(message);
    this.name = "AnthropicError";
  }
}

// Anthropic requires max_tokens; LLMOptions.maxTokens is optional.
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Adapts Anthropic Messages API endpoints to the internal LLM protocol.
 */
export class AnthropicClient implements LLMClient {
  private readonly client: Anthropic;

  constructor(private readonly options: AnthropicClientOptions) {
    this.client = createAnthropicClient(options);
  }

  async generate(input: LLMInput): Promise<LLMResponse> {
    try {
      const data = await this.client.messages.create(
        buildAnthropicParams(this.options, input),
        input.signal === undefined ? undefined : { signal: input.signal },
      );
      return {
        message: parseAssistantMessage(data),
        finishReason: data.stop_reason ?? undefined,
        usage: toLLMUsage(data.usage.input_tokens, data.usage.output_tokens),
      };
    } catch (error) {
      rethrowAnthropicError(error, input.signal);
    }
  }

  async *stream(input: LLMInput): AsyncIterable<LLMStreamChunk> {
    let sequence = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = await this.client.messages.create(
        {
          ...buildAnthropicParams(this.options, input),
          stream: true,
        },
        input.signal === undefined ? undefined : { signal: input.signal },
      );

      for await (const event of stream) {
        if (event.type === "message_start") {
          inputTokens = event.message.usage.input_tokens;
          outputTokens = event.message.usage.output_tokens;
          continue;
        }

        if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block.type === "tool_use") {
            yield createStreamChunk(
              sequence++,
              {
                type: "tool-call-delta",
                contentIndex: event.index,
                id: block.id,
                name: block.name,
              },
              undefined,
              undefined,
            );
            continue;
          }
          if (
            block.type !== "text" &&
            block.type !== "thinking" &&
            block.type !== "redacted_thinking"
          ) {
            throw new AnthropicError(
              "Anthropic stream contains an unsupported content block.",
            );
          }
          continue;
        }

        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta" && event.delta.text.length > 0) {
            yield createStreamChunk(
              sequence++,
              { type: "text-delta", delta: event.delta.text },
              undefined,
              undefined,
            );
          } else if (
            event.delta.type === "thinking_delta" &&
            event.delta.thinking.length > 0
          ) {
            yield createStreamChunk(
              sequence++,
              { type: "thinking-delta", delta: event.delta.thinking },
              undefined,
              undefined,
            );
          } else if (event.delta.type === "input_json_delta") {
            yield createStreamChunk(
              sequence++,
              {
                type: "tool-call-delta",
                contentIndex: event.index,
                arguments: event.delta.partial_json,
              },
              undefined,
              undefined,
            );
          }
          continue;
        }

        if (event.type === "message_delta") {
          if (event.usage.input_tokens != null) {
            inputTokens = event.usage.input_tokens;
          }
          outputTokens = event.usage.output_tokens;
          const finishReason = event.delta.stop_reason ?? undefined;
          yield createStreamChunk(
            sequence++,
            undefined,
            finishReason,
            toLLMUsage(inputTokens, outputTokens),
          );
        }
      }
    } catch (error) {
      rethrowAnthropicError(error, input.signal);
    }
  }
}

function createAnthropicClient(options: AnthropicClientOptions): Anthropic {
  return new Anthropic({
    baseURL: normalizeBaseURL(options.baseURL),
    apiKey: options.apiKey,
    defaultHeaders: options.headers,
    fetch: options.fetch ?? globalThis.fetch,
    // Preserve one network attempt per call until retry policy is designed.
    maxRetries: 0,
  });
}

function buildAnthropicParams(
  options: AnthropicClientOptions,
  input: LLMInput,
): Anthropic.MessageCreateParamsNonStreaming {
  const { system, messages } = toAnthropicMessages(input.messages);
  return {
    model: options.model,
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages,
    ...(system === undefined ? {} : { system }),
    ...(input.tools.length === 0
      ? {}
      : { tools: input.tools.map(toAnthropicTool) }),
    ...(options.temperature === undefined
      ? {}
      : { temperature: options.temperature }),
    ...toAnthropicThinkingParams(options.thinking ?? { type: "off" }),
  } as Anthropic.MessageCreateParamsNonStreaming;
}

function normalizeBaseURL(baseURL: string): string {
  const url = new URL(baseURL);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Anthropic base URL must use HTTP or HTTPS.");
  }
  if (url.search || url.hash) {
    throw new TypeError("Anthropic base URL cannot include a query or hash.");
  }
  return url.toString().replace(/\/$/, "");
}

function serializeValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? String(value);
}

function toAnthropicMessages(messages: readonly Message[]): {
  system?: string;
  messages: Anthropic.MessageParam[];
} {
  const systemParts: string[] = [];
  const mapped: Anthropic.MessageParam[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
      continue;
    }
    if (message.role === "user") {
      mapped.push({
        role: "user",
        content: message.content.map((block) => ({
          type: "text",
          text: block.text,
        })),
      });
      continue;
    }
    if (message.role === "assistant") {
      mapped.push({
        role: "assistant",
        content: toAnthropicAssistantContent(message.content),
      });
      continue;
    }

    const toolResult: Anthropic.ToolResultBlockParam = {
      type: "tool_result",
      tool_use_id: message.toolCallId,
      content: serializeValue(message.content),
      ...(message.isError === true ? { is_error: true } : {}),
    };
    const last = mapped[mapped.length - 1];
    // Parallel tool results must share one user turn; consecutive user turns are invalid.
    if (
      last?.role === "user" &&
      Array.isArray(last.content) &&
      last.content.length > 0 &&
      last.content.every((block) => block.type === "tool_result")
    ) {
      last.content.push(toolResult);
      continue;
    }
    mapped.push({ role: "user", content: [toolResult] });
  }

  return {
    ...(systemParts.length === 0 ? {} : { system: systemParts.join("\n\n") }),
    messages: mapped,
  };
}

function toAnthropicAssistantContent(
  content: readonly AssistantContent[],
): Anthropic.ContentBlockParam[] | string {
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const block of content) {
    if (block.type === "text") {
      if (block.text.length > 0) {
        blocks.push({ type: "text", text: block.text });
      }
      continue;
    }
    // Anthropic requires a signature on thinking blocks; we do not store it yet.
    if (block.type === "thinking") continue;
    blocks.push({
      type: "tool_use",
      id: block.id,
      name: block.name,
      input: toToolInput(block.input),
    });
  }
  return blocks.length === 0 ? "" : blocks;
}

function toToolInput(input: unknown): unknown {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return input;
  }
}

function toAnthropicTool(tool: ToolDefinition): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: "object",
      ...(tool.inputSchema ?? { properties: {} }),
    } as Anthropic.Tool.InputSchema,
  };
}

function parseAssistantMessage(response: Anthropic.Message): AssistantMessage {
  if (!Array.isArray(response.content)) {
    throw new AnthropicError(
      "Anthropic response does not contain content.",
    );
  }

  const content: AssistantContent[] = [];
  for (const block of response.content) {
    if (block.type === "text") {
      if (block.text.length > 0) content.push({ type: "text", text: block.text });
      continue;
    }
    if (block.type === "tool_use") {
      if (typeof block.id !== "string" || typeof block.name !== "string") {
        throw new AnthropicError(
          "Anthropic response contains an invalid tool call.",
        );
      }
      content.push({
        type: "tool-call",
        id: block.id,
        name: block.name,
        input: block.input,
      });
      continue;
    }
    if (block.type === "thinking") {
      if (block.thinking.length > 0) {
        content.push({ type: "thinking", text: block.thinking });
      }
      continue;
    }
    if (block.type === "redacted_thinking") {
      continue;
    }
    throw new AnthropicError(
      "Anthropic response contains an unsupported content block.",
    );
  }
  if (content.length === 0) content.push({ type: "text", text: "" });
  return { id: createMessageId(), role: "assistant", content };
}

function toLLMUsage(inputTokens: number, outputTokens: number): LLMUsage {
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

function rethrowAnthropicError(error: unknown, signal?: AbortSignal): never {
  if (error instanceof APIUserAbortError) {
    throw (
      signal?.reason ??
      new DOMException("The operation was aborted.", "AbortError")
    );
  }
  if (!(error instanceof APIError)) throw error;
  throw new AnthropicError(
    error.status === undefined
      ? `Anthropic request failed: ${error.message}`
      : `Anthropic request failed with ${error.status}: ${error.message}`,
    error.status,
    serializeErrorBody(error),
  );
}

function serializeErrorBody(error: APIError): string | undefined {
  if (error.error === undefined) return undefined;
  try {
    return JSON.stringify({ error: error.error });
  } catch {
    return String(error.error);
  }
}
