import OpenAI, { APIError, APIUserAbortError } from "openai";
import type {
  ModelInput,
  ModelResponse,
  ModelStreamEvent,
  ModelUsage,
  StreamingModel,
} from "@/model/model.js";
import type {
  AssistantContent,
  AssistantMessage,
  Message,
  ToolCall,
} from "@/core/message.js";
import type { ToolDefinition } from "@/core/tool.js";

export interface OpenAICompatibleModelOptions {
  baseURL: string;
  model: string;
  apiKey?: string;
  headers?: Readonly<Record<string, string>>;
  maxTokens?: number;
  temperature?: number;
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
 * Adapts OpenAI-compatible Chat Completions endpoints to the runtime model contract.
 */
export class OpenAICompatibleModel implements StreamingModel {
  private readonly client: OpenAI;

  constructor(private readonly options: OpenAICompatibleModelOptions) {
    const hasApiKey = Boolean(options.apiKey);
    this.client = new OpenAI({
      baseURL: normalizeBaseURL(options.baseURL),
      // The SDK requires a non-empty key during construction. Removing the generated
      // Authorization header preserves support for unauthenticated local endpoints.
      apiKey: hasApiKey ? options.apiKey : "openai-compatible-no-key",
      defaultHeaders: {
        ...(hasApiKey ? {} : { Authorization: null }),
        ...options.headers,
      },
      fetch: options.fetch ?? globalThis.fetch,
      // Preserve one network attempt per generate call until retry policy is designed.
      maxRetries: 0,
    });
  }

  async generate(input: ModelInput): Promise<ModelResponse> {
    try {
      const data = await this.client.chat.completions.create(
        createRequest(this.options, input),
        input.signal === undefined ? undefined : { signal: input.signal },
      );
      const usage = parseUsage(data);
      return {
        message: parseAssistantMessage(data),
        ...(data.choices[0]?.finish_reason
          ? { finishReason: data.choices[0].finish_reason }
          : {}),
        ...(usage === undefined ? {} : { usage }),
      };
    } catch (error) {
      rethrowOpenAIError(error, input.signal);
    }
  }

  async *stream(input: ModelInput): AsyncIterable<ModelStreamEvent> {
    const pendingToolCalls = new Map<number, PendingToolCall>();
    let text = "";
    let finishReason: string | undefined;
    let usage: ModelUsage | undefined;

    try {
      const stream = await this.client.chat.completions.create(
        {
          ...createRequest(this.options, input),
          stream: true,
          stream_options: { include_usage: true },
        },
        input.signal === undefined ? undefined : { signal: input.signal },
      );

      for await (const chunk of stream) {
        if (chunk.usage != null) usage = toModelUsage(chunk.usage);

        const choice = chunk.choices[0];
        if (choice === undefined) continue;
        if (choice.finish_reason !== null) {
          finishReason = choice.finish_reason;
        }

        const delta = choice.delta.content;
        if (delta !== undefined && delta !== null && delta.length > 0) {
          text += delta;
          yield { type: "text-delta", delta };
        }

        for (const call of choice.delta.tool_calls ?? []) {
          if (call.type !== undefined && call.type !== "function") {
            throw new OpenAICompatibleError(
              "OpenAI-compatible stream contains an unsupported tool call.",
            );
          }
          const pending = pendingToolCalls.get(call.index) ?? { arguments: "" };
          if (call.id !== undefined) pending.id = call.id;
          if (call.function?.name !== undefined) {
            pending.name = call.function.name;
          }
          if (call.function?.arguments !== undefined) {
            pending.arguments += call.function.arguments;
          }
          pendingToolCalls.set(call.index, pending);
        }
      }
    } catch (error) {
      rethrowOpenAIError(error, input.signal);
    }

    yield {
      type: "response",
      response: createStreamResponse(
        text,
        pendingToolCalls,
        finishReason,
        usage,
      ),
    };
  }
}

interface PendingToolCall {
  id?: string;
  name?: string;
  arguments: string;
}

function createRequest(
  options: OpenAICompatibleModelOptions,
  input: ModelInput,
): OpenAI.ChatCompletionCreateParamsNonStreaming {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    ...(input.systemPrompt === undefined
      ? []
      : [{ role: "system" as const, content: input.systemPrompt }]),
    ...input.messages.map(toOpenAIMessage),
  ];
  return {
    model: options.model,
    messages,
    ...(input.tools.length === 0
      ? {}
      : { tools: input.tools.map(toOpenAITool) }),
    ...(options.maxTokens === undefined
      ? {}
      : { max_tokens: options.maxTokens }),
    ...(options.temperature === undefined
      ? {}
      : { temperature: options.temperature }),
  };
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

function toOpenAIMessage(message: Message): OpenAI.ChatCompletionMessageParam {
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
  const toolCalls = message.content
    .filter((block): block is ToolCall => block.type === "tool-call")
    .map(toOpenAIToolCall);

  return {
    role: "assistant",
    content: text || null,
    ...(toolCalls.length === 0 ? {} : { tool_calls: toolCalls }),
  };
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
  return { role: "assistant", content };
}

function parseUsage(response: OpenAI.ChatCompletion): ModelUsage | undefined {
  if (response.usage === undefined) return undefined;
  return toModelUsage(response.usage);
}

function toModelUsage(usage: OpenAI.CompletionUsage): ModelUsage {
  const inputTokens = usage.prompt_tokens ?? 0;
  const outputTokens = usage.completion_tokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: usage.total_tokens ?? inputTokens + outputTokens,
  };
}

function createStreamResponse(
  text: string,
  pendingToolCalls: ReadonlyMap<number, PendingToolCall>,
  finishReason?: string,
  usage?: ModelUsage,
): ModelResponse {
  const content: AssistantContent[] = [];
  if (text.length > 0) content.push({ type: "text", text });

  for (const [, call] of [...pendingToolCalls].sort(
    ([left], [right]) => left - right,
  )) {
    if (call.id === undefined || call.name === undefined) {
      throw new OpenAICompatibleError(
        "OpenAI-compatible stream contains an incomplete tool call.",
      );
    }
    content.push({
      type: "tool-call",
      id: call.id,
      name: call.name,
      input: parseToolInput(call.arguments),
    });
  }

  if (content.length === 0) content.push({ type: "text", text: "" });
  return {
    message: { role: "assistant", content },
    ...(finishReason === undefined ? {} : { finishReason }),
    ...(usage === undefined ? {} : { usage }),
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
