import type { AssistantMessage, Message } from "@/core/message.js";
import type { MessageDelta } from "@/core/message-delta.js";
import type { ToolDefinition } from "@/core/tool.js";
import {
  resolveProvider,
  type Provider,
  type ProviderConfig,
} from "@/llm/provider.js";
import {
  listOpenAICompatibleModels,
  OpenAICompatibleClient,
} from "@/llm/openai-compatible.js";

export interface LLMInput {
  messages: readonly Message[];
  tools: readonly ToolDefinition[];
  signal?: AbortSignal;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  message: AssistantMessage;
  finishReason?: string;
  usage?: LLMUsage;
}

export interface LLMStreamChunk {
  sequence: number;
  timestamp: number;
  delta?: MessageDelta;
  finishReason?: string;
  usage?: LLMUsage;
}

export interface LLMOptions {
  provider: Provider;
  model: string;
  apiKey?: string;
  /**
   * Overrides the provider default endpoint. Required for openai-compatible.
   */
  baseURL?: string;
  temperature?: number;
  maxTokens?: number;
  headers?: Readonly<Record<string, string>>;
  fetch?: typeof globalThis.fetch;
}

export interface ListModelsOptions {
  provider: Provider;
  apiKey?: string;
  /**
   * Overrides the provider default endpoint. Required for openai-compatible.
   */
  baseURL?: string;
  headers?: Readonly<Record<string, string>>;
  fetch?: typeof globalThis.fetch;
}

export interface LLMModelInfo {
  id: string;
  name?: string;
}

/**
 * Internal protocol implemented by provider clients.
 */
export interface LLMClient {
  generate(input: LLMInput): Promise<LLMResponse>;
  stream(input: LLMInput): AsyncIterable<LLMStreamChunk>;
}

/**
 * A callable LLM client
 * Combines provider configuration, model selection, credentials, and a callable client.
 */
export class LLM {
  private readonly client: LLMClient;

  readonly provider: Provider;
  readonly model: string;

  constructor(options: LLMOptions) {
    this.provider = options.provider; 
    this.model = options.model;

    const providerConfig = resolveProvider(options.provider, options.baseURL);
    validateApiKey(options.provider, providerConfig, options.apiKey);
    this.client = createLLMClient(options, providerConfig);
  }

  generate(input: LLMInput): Promise<LLMResponse> {
    return this.client.generate(input);
  }

  stream(input: LLMInput): AsyncIterable<LLMStreamChunk> {
    return this.client.stream(input);
  }
}

/**
 * Lists models exposed by a provider's model discovery endpoint.
 */
export async function listModels(
  options: ListModelsOptions,
): Promise<LLMModelInfo[]> {
  const providerConfig = resolveProvider(options.provider, options.baseURL);
  validateApiKey(options.provider, providerConfig, options.apiKey);

  return listOpenAICompatibleModels({
    baseURL: providerConfig.baseURL,
    apiKey: options.apiKey,
    headers: options.headers,
    fetch: options.fetch,
  });
}

function createLLMClient(
  options: LLMOptions,
  providerConfig: ProviderConfig,
): LLMClient {
  switch (options.provider) {
    case "openai":
    case "openrouter":
    case "dashscope":
    case "siliconflow":
    case "ollama":
    case "openai-compatible":
      return new OpenAICompatibleClient({
        baseURL: providerConfig.baseURL,
        model: options.model,
        apiKey: options.apiKey,
        headers: options.headers,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        fetch: options.fetch,
      });
  }
}

function validateApiKey(
  provider: Provider,
  providerConfig: ProviderConfig,
  apiKey: string | undefined,
): void {
  if (providerConfig.apiKeyRequired && !apiKey) {
    throw new Error(`apiKey is required for ${provider} provider`);
  }
}
