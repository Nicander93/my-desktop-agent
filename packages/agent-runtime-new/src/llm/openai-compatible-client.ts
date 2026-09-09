import OpenAI, { APIError, APIUserAbortError } from "openai";
import {
  createStreamChunk,
  type LLMClient,
  type LLMInput,
  type LLMResponse,
  type LLMStreamChunk,
  type LLMUsage,
} from "@/llm/llm-client.js";
import type { MessageDelta } from "@/core/message-delta.js";
import type {
  AssistantContent,
  AssistantMessage,
  Message,
  ToolCall,
} from "@/core/message.js";
import { createMessageId } from "@/core/message.js";
import type { ToolDefinition } from "@/core/tool.js";
import type { Provider } from "@/llm/provider.js";
import {
  toOpenAIThinkingParams,
  type ThinkingConfig,
} from "@/llm/thinking.js";

export interface OpenAICompatibleClientOptions {
  baseURL: string;
  model: string;
  apiKey?: string;
  headers?: Readonly<Record<string, string>>;
  maxTokens?: number;
  temperature?: number;
  provider?: Exclude<Provider, "anthropic">;
  thinking?: ThinkingConfig;
  fetch?: typeof globalThis.fetch;
}

/**
 * Preserves provider failure details without exposing SDK-specific error types.
 */
export class OpenAICompatibleError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly responseBody?: string,
  ) {
    super(message);
    this.name = "OpenAICompatibleError";
  }
}

/**
 * Adapts OpenAI-compatible Chat Completions endpoints to the internal LLM protocol.
 */
export class OpenAICompatibleClient implements LLMClient {
  private readonly client: OpenAI;

  constructor(private readonly options: OpenAICompatibleClientOptions) {
    this.client = createOpenAIClient(options);
  }

  async generate(input: LLMInput): Promise<LLMResponse> {
    try {
      const data = await this.client.chat.completions.create(
        buildOpenAIParams(this.options, input),
        input.signal === undefined ? undefined : { signal: input.signal },
      );
      const usage = parseUsage(data);
      return {
        message: parseAssistantMessage(data),
        finishReason: data.choices[0]?.finish_reason,
        usage,
      };
    } catch (error) {
      rethrowOpenAIError(error, input.signal);
    }
  }

  async *stream(input: LLMInput): AsyncIterable<LLMStreamChunk> {
    let sequence = 0;

    try {
      const stream = await this.client.chat.completions.create(
        {
          ...buildOpenAIParams(this.options, input),
          stream: true,
          stream_options: { include_usage: true },
        },
        input.signal === undefined ? undefined : { signal: input.signal },
      );

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        const usage = chunk.usage == null ? undefined : toLLMUsage(chunk.usage);
        // empty chunk:  only yield usage if there is no choice
        if (choice === undefined) {
          if (usage !== undefined) {
            yield createStreamChunk(sequence++, undefined, undefined, usage);
          }
          continue;
        }

        // normal output chunk: yield deltas and usage
        const deltas: MessageDelta[] = [];
        const reasoning = readReasoning(choice.delta);
        if (reasoning !== undefined) {
          deltas.push({ type: "thinking-delta", delta: reasoning });
        }
        const text = choice.delta.content;
        if (text !== undefined && text !== null && text.length > 0) {
          deltas.push({ type: "text-delta", delta: text });
        }

        // tool call delta: add to deltas
        for (const call of choice.delta.tool_calls ?? []) {
          if (call.type !== undefined && call.type !== "function") {
            throw new OpenAICompatibleError(
              "OpenAI-compatible stream contains an unsupported tool call.",
            );
          }
          deltas.push({
            type: "tool-call-delta",
            contentIndex: call.index,
            id: call.id,
            name: call.function?.name,
            arguments: call.function?.arguments,
          });
        }
        
        const finishReason =
          choice.finish_reason === null ? undefined : choice.finish_reason;
        // finish 
        if (deltas.length > 0) {
          // flatten deltas into stream chunks, because some providers (e.g. OpenAI)
          // may return multiple deltas in a single chunk.
          for (const [index, delta] of deltas.entries()) {
            const isLast = index === deltas.length - 1;
            yield createStreamChunk(
              sequence++,
              delta,
              isLast ? finishReason : undefined,
              isLast ? usage : undefined,
            );
          }
        } else if (finishReason !== undefined || usage !== undefined) {
          yield createStreamChunk(sequence++, undefined, finishReason, usage);
        }
      }
    } catch (error) {
      rethrowOpenAIError(error, input.signal);
    }
  }
}

function createOpenAIClient(options: OpenAICompatibleClientOptions): OpenAI {
  const hasApiKey = Boolean(options.apiKey);
  return new OpenAI({
    baseURL: normalizeBaseURL(options.baseURL),
    // The SDK requires a non-empty key during construction. Removing the generated
    // Authorization header preserves support for unauthenticated local endpoints.
    apiKey: hasApiKey ? options.apiKey : "openai-compatible-no-key",
    defaultHeaders: {
      ...(hasApiKey ? {} : { Authorization: null }),
      ...options.headers,
    },
    fetch: options.fetch ?? globalThis.fetch,
    // Preserve one network attempt per call until retry policy is designed.
    maxRetries: 0,
  });
}

function buildOpenAIParams(
  options: OpenAICompatibleClientOptions,
  input: LLMInput,
): OpenAI.ChatCompletionCreateParamsNonStreaming {
  const messages: OpenAI.ChatCompletionMessageParam[] =
    input.messages.map((message) =>
      toOpenAIMessage(message, options.provider),
    );
  return {
    model: options.model,
    messages,
    ...(input.tools.length === 0
      ? {}
      : { tools: input.tools.map(toOpenAITool) }),
    max_tokens: options.maxTokens,
    temperature: options.temperature,
    ...toOpenAIThinkingParams(
      options.provider ?? "openai-compatible",
      options.model,
      options.thinking ?? { type: "off" },
    ),
  } as OpenAI.ChatCompletionCreateParamsNonStreaming;
}

function normalizeBaseURL(baseURL: string): string {
  const url = new URL(baseURL);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("OpenAI-compatible base URL must use HTTP or HTTPS.");
  }
  if (url.search || url.hash) {
    throw new TypeError(
      "OpenAI-compatible base URL cannot include a query or hash.",
    );
  }
  return url.toString().replace(/\/$/, "");
}

function serializeValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? String(value);
}

function toOpenAIToolCall(
  call: ToolCall,
): OpenAI.ChatCompletionMessageFunctionToolCall {
  return {
    id: call.id,
    type: "function",
    function: {
      name: call.name,
      arguments: serializeValue(call.input),
    },
  };
}

function toOpenAIMessage(
  message: Message,
  provider?: Exclude<Provider, "anthropic">,
): OpenAI.ChatCompletionMessageParam {
  if (message.role === "system") {
    return { role: "system", content: message.content };
  }
  if (message.role === "user") {
    return {
      role: "user",
      content: message.content.map((block) => block.text).join(""),
    };
  }
  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.toolCallId,
      content: serializeValue(message.content),
    };
  }

  const text = message.content
    .filter(
      (block): block is Extract<AssistantContent, { type: "text" }> =>
        block.type === "text",
    )
    .map((block) => block.text)
    .join("");
  const thinking = message.content
    .filter(
      (block): block is Extract<AssistantContent, { type: "thinking" }> =>
        block.type === "thinking",
    )
    .map((block) => block.text)
    .join("");
  const toolCalls = message.content
    .filter((block): block is ToolCall => block.type === "tool-call")
    .map(toOpenAIToolCall);

  return {
    role: "assistant",
    content: text || null,
    ...(toolCalls.length === 0 ? {} : { tool_calls: toolCalls }),
    ...(thinking.length === 0
      ? {}
      : provider === "ollama"
        ? { reasoning: thinking }
        : { reasoning_content: thinking }),
  } as OpenAI.ChatCompletionMessageParam;
}

function toOpenAITool(tool: ToolDefinition): OpenAI.ChatCompletionFunctionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema ?? { type: "object", properties: {} },
    },
  };
}

function parseToolInput(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    // Preserve provider output for downstream validation instead of guessing a repair.
    return value;
  }
}

function parseAssistantMessage(
  response: OpenAI.ChatCompletion,
): AssistantMessage {
  if (!Array.isArray(response.choices)) {
    throw new OpenAICompatibleError(
      "OpenAI-compatible response does not contain choices.",
    );
  }
  const source = response.choices[0]?.message;
  if (source === undefined) {
    throw new OpenAICompatibleError(
      "OpenAI-compatible response does not contain an assistant message.",
    );
  }

  const content: AssistantContent[] = [];
  const reasoning = readReasoning(source);
  if (reasoning !== undefined) {
    content.push({ type: "thinking", text: reasoning });
  }
  if (typeof source.content === "string" && source.content.length > 0) {
    content.push({ type: "text", text: source.content });
  }
  for (const call of source.tool_calls ?? []) {
    if (
      call.type !== "function" ||
      typeof call.id !== "string" ||
      typeof call.function?.name !== "string" ||
      typeof call.function.arguments !== "string"
    ) {
      throw new OpenAICompatibleError(
        "OpenAI-compatible response contains an invalid tool call.",
      );
    }
    content.push({
      type: "tool-call",
      id: call.id,
      name: call.function.name,
      input: parseToolInput(call.function.arguments),
    });
  }
  if (content.length === 0) content.push({ type: "text", text: "" });
  return { id: createMessageId(), role: "assistant", content };
}

function readReasoning(source: unknown): string | undefined {
  if (source === null || typeof source !== "object") return undefined;
  const record = source as {
    reasoning_content?: unknown;
    reasoning?: unknown;
  };
  const value = record.reasoning_content ?? record.reasoning;
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value;
}

function parseUsage(response: OpenAI.ChatCompletion): LLMUsage | undefined {
  if (response.usage === undefined) return undefined;
  return toLLMUsage(response.usage);
}

/**
 * get LLMUsage from OpenAI.CompletionUsage
 * @param usage OpenAI.CompletionUsage
 * @returns 
 */
function toLLMUsage(usage: OpenAI.CompletionUsage): LLMUsage {
  const inputTokens = usage.prompt_tokens ?? 0;
  const outputTokens = usage.completion_tokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: usage.total_tokens ?? inputTokens + outputTokens,
  };
}

function rethrowOpenAIError(error: unknown, signal?: AbortSignal): never {
  if (error instanceof APIUserAbortError) {
    // Preserve AbortSignal semantics instead of exposing an SDK-specific abort error.
    throw (
      signal?.reason ??
      new DOMException("The operation was aborted.", "AbortError")
    );
  }
  if (!(error instanceof APIError)) throw error;
  throw new OpenAICompatibleError(
    error.status === undefined
      ? `OpenAI-compatible request failed: ${error.message}`
      : `OpenAI-compatible request failed with ${error.status}: ${error.message}`,
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
