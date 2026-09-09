import type { Provider } from "@/llm/provider.js";

export type ThinkingEffort = "none" | "low" | "medium" | "high" | "xhigh";

export type ThinkingConfig =
  | { type: "off" }
  | { type: "on" }
  | { type: "effort"; level: ThinkingEffort }
  | { type: "budget"; tokens: number };

export type ThinkingOptions =
  | { type: "unsupported" }
  | { type: "toggle"; default: { type: "on" } | { type: "off" } }
  | {
      type: "effort";
      levels: readonly ThinkingEffort[];
      default: { type: "effort"; level: ThinkingEffort };
    }
  | {
      type: "budget";
      minTokens: number;
      maxTokens: number;
      default: { type: "off" } | { type: "budget"; tokens: number };
    }
  | { type: "always-on"; default: { type: "on" } };

const O_SERIES_EFFORT: readonly ThinkingEffort[] = ["low", "medium", "high"];
const GPT5_EFFORT: readonly ThinkingEffort[] = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
];

/**
 * UI-facing thinking controls for a provider/model pair.
 *
 * ponytail: static name matching, not a /models probe. Add rows when a live
 * call 400s on an unknown thinking field or a missing required one.
 */
export function getThinkingOptions(
  provider: Provider,
  model: string,
): ThinkingOptions {
  const id = model.trim().toLowerCase();
  switch (provider) {
    case "openai":
      return openaiThinkingOptions(id);
    case "dashscope":
      return dashscopeThinkingOptions(id);
    case "anthropic":
      return anthropicThinkingOptions(id);
    default:
      return { type: "unsupported" };
  }
}

/**
 * Resolves omitted thinking to the catalog default and rejects illegal values.
 */
export function resolveThinking(
  provider: Provider,
  model: string,
  thinking?: ThinkingConfig,
): ThinkingConfig {
  const options = getThinkingOptions(provider, model);
  const resolved = thinking ?? defaultThinking(options);
  if (!isThinkingAllowed(options, resolved)) {
    throw new Error(
      `thinking ${JSON.stringify(resolved)} is not supported for ${provider} model ${model}`,
    );
  }
  return resolved;
}

export function toOpenAIThinkingParams(
  provider: Provider,
  model: string,
  thinking: ThinkingConfig,
): { reasoning_effort?: ThinkingEffort; enable_thinking?: boolean } {
  const options = getThinkingOptions(provider, model);
  if (provider === "dashscope" && options.type === "toggle") {
    return { enable_thinking: thinking.type === "on" };
  }
  if (provider === "openai" && thinking.type === "effort") {
    return { reasoning_effort: thinking.level };
  }
  return {};
}

export function toAnthropicThinkingParams(thinking: ThinkingConfig): {
  thinking?: { type: "enabled"; budget_tokens: number };
} {
  if (thinking.type !== "budget") return {};
  return {
    thinking: { type: "enabled", budget_tokens: thinking.tokens },
  };
}

function openaiThinkingOptions(id: string): ThinkingOptions {
  if (id.startsWith("gpt-5")) {
    return {
      type: "effort",
      levels: GPT5_EFFORT,
      default: { type: "effort", level: "medium" },
    };
  }
  if (/^o[1-9]/.test(id)) {
    return {
      type: "effort",
      levels: O_SERIES_EFFORT,
      default: { type: "effort", level: "medium" },
    };
  }
  return { type: "unsupported" };
}

function dashscopeThinkingOptions(id: string): ThinkingOptions {
  if (id.includes("qwq") || /-thinking(?:-|$)/.test(id)) {
    return { type: "always-on", default: { type: "on" } };
  }
  if (
    id.includes("qwen3") ||
    id.includes("qwen-plus") ||
    id.includes("qwen-turbo") ||
    id.includes("qwen-max") ||
    id.includes("qwen-flash")
  ) {
    return { type: "toggle", default: { type: "off" } };
  }
  return { type: "unsupported" };
}

function anthropicThinkingOptions(id: string): ThinkingOptions {
  if (!id.includes("claude")) return { type: "unsupported" };
  return {
    type: "budget",
    minTokens: 1024,
    maxTokens: 32000,
    default: { type: "off" },
  };
}

function defaultThinking(options: ThinkingOptions): ThinkingConfig {
  if (options.type === "unsupported") return { type: "off" };
  return options.default;
}

function isThinkingAllowed(
  options: ThinkingOptions,
  thinking: ThinkingConfig,
): boolean {
  switch (options.type) {
    case "unsupported":
      return thinking.type === "off";
    case "toggle":
      return thinking.type === "on" || thinking.type === "off";
    case "always-on":
      return thinking.type === "on";
    case "effort":
      return (
        thinking.type === "effort" && options.levels.includes(thinking.level)
      );
    case "budget":
      return (
        thinking.type === "off" ||
        (thinking.type === "budget" &&
          thinking.tokens >= options.minTokens &&
          thinking.tokens <= options.maxTokens)
      );
  }
}
