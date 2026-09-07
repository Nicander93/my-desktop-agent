export type Provider =
  | "openai"
  | "openrouter"
  | "dashscope"
  | "siliconflow"
  | "ollama"
  | "openai-compatible";

export interface ProviderConfig {
  baseURL: string;
  apiKeyRequired: boolean;
}

const PROVIDERS: Record<Exclude<Provider, "openai-compatible">, ProviderConfig> = {
  openai: {
    baseURL: "https://api.openai.com/v1",
    apiKeyRequired: true,
  },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    apiKeyRequired: true,
  },
  dashscope: {
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKeyRequired: true,
  },
  siliconflow: {
    baseURL: "https://api.siliconflow.cn/v1",
    apiKeyRequired: true,
  },
  ollama: {
    baseURL: "http://localhost:11434/v1",
    apiKeyRequired: false,
  },
};

/**
 * Resolves endpoint and credential rules. An explicit baseURL overrides the default.
 */
export function resolveProvider(
  provider: Provider,
  baseURL?: string,
): ProviderConfig {
  if (provider === "openai-compatible") {
    if (!baseURL) {
      throw new Error("baseURL is required for openai-compatible provider");
    }

    return {
      baseURL,
      apiKeyRequired: false,
    };
  }

  const config = PROVIDERS[provider];
  if (!baseURL) {
    return config;
  }
  // override the baseURL
  return { ...config, baseURL };


}
