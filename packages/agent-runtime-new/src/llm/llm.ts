import {
  resolveProvider,
  type Provider,
  type ProviderConfig,
} from "@/llm/provider.js";
import { OpenAICompatibleClient } from "@/llm/openai-compatible-client.js";
import { AnthropicClient } from "@/llm/anthropic-client.js";
import {
  resolveThinking,
  type ThinkingConfig,
} from "@/llm/thinking.js";
import type {
  LLMClient,
  LLMInput,
  LLMResponse,
  LLMStreamChunk,
} from "@/llm/llm-client.js";

export type {
  LLMInput,
  LLMResponse,
  LLMStreamChunk,
  LLMUsage,
} from "@/llm/llm-client.js";

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
  /**
   * Omitted values use the catalog default for this provider and model.
   */
  thinking?: ThinkingConfig;
  headers?: Readonly<Record<string, string>>;
  fetch?: typeof globalThis.fetch;
}

/**
 * public llm client
 * Combines provider configuration, model selection, credentials a callable client.
 */
export class LLM {
  private readonly client: LLMClient;

  readonly provider: Provider;
  readonly model: string;
  readonly thinking: ThinkingConfig;

  constructor(options: LLMOptions) {
    this.provider = options.provider;
    this.model = options.model;
    this.thinking = resolveThinking(
      options.provider,
      options.model,
      options.thinking,
    );

    const providerConfig = resolveProvider(options.provider, options.baseURL);
    validateApiKey(options.provider, providerConfig, options.apiKey);
    this.client = createLLMClient(options, providerConfig, this.thinking);
  }

  generate(input: LLMInput): Promise<LLMResponse> {
    return this.client.generate(input);
  }

  stream(input: LLMInput): AsyncIterable<LLMStreamChunk> {
    return this.client.stream(input);
  }
}

function createLLMClient(
  options: LLMOptions,
  providerConfig: ProviderConfig,
  thinking: ThinkingConfig,
): LLMClient {
  switch (options.provider) {
    case "anthropic":
      return new AnthropicClient({
        baseURL: providerConfig.baseURL,
        model: options.model,
        apiKey: options.apiKey,
        headers: options.headers,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        thinking,
        fetch: options.fetch,
      });
    case "openai":
    case "openrouter":
    case "dashscope":
    case "siliconflow":
    case "ollama":
    case "openai-compatible":
      return new OpenAICompatibleClient({
        provider: options.provider,
        baseURL: providerConfig.baseURL,
        model: options.model,
        apiKey: options.apiKey,
        headers: options.headers,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        thinking,
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
