import { describe, expect, it } from "vitest";
import {
  getThinkingOptions,
  resolveThinking,
  toAnthropicThinkingParams,
  toOpenAIThinkingParams,
} from "@/llm/thinking.js";

describe("getThinkingOptions", () => {
  it("classifies models by provider and name", () => {
    expect(getThinkingOptions("openai", "gpt-4o")).toEqual({
      type: "unsupported",
    });
    expect(getThinkingOptions("openai", "o3")).toMatchObject({
      type: "effort",
      levels: ["low", "medium", "high"],
      default: { type: "effort", level: "medium" },
    });
    expect(getThinkingOptions("openai", "gpt-5")).toEqual({
      type: "effort",
      levels: ["none", "low", "medium", "high", "xhigh"],
      default: { type: "effort", level: "medium" },
    });
    expect(getThinkingOptions("dashscope", "qwen3-plus")).toEqual({
      type: "toggle",
      default: { type: "off" },
    });
    expect(getThinkingOptions("dashscope", "qwq-plus")).toEqual({
      type: "always-on",
      default: { type: "on" },
    });
    expect(getThinkingOptions("anthropic", "claude-sonnet-4")).toMatchObject({
      type: "budget",
      default: { type: "off" },
    });
    expect(getThinkingOptions("openai-compatible", "o3")).toEqual({
      type: "unsupported",
    });
  });
});

describe("resolveThinking", () => {
  it("fills in the catalog default when thinking is omitted", () => {
    expect(resolveThinking("openai", "gpt-4o")).toEqual({ type: "off" });
    expect(resolveThinking("openai", "o3")).toEqual({
      type: "effort",
      level: "medium",
    });
    expect(resolveThinking("dashscope", "qwen3-plus")).toEqual({ type: "off" });
    expect(resolveThinking("dashscope", "qwq-plus")).toEqual({ type: "on" });
    expect(resolveThinking("anthropic", "claude-sonnet-4")).toEqual({
      type: "off",
    });
  });

  it("keeps an explicit value that the catalog allows", () => {
    expect(
      resolveThinking("openai", "gpt-5", { type: "effort", level: "none" }),
    ).toEqual({ type: "effort", level: "none" });
    expect(
      resolveThinking("dashscope", "qwen3-plus", { type: "on" }),
    ).toEqual({ type: "on" });
    expect(
      resolveThinking("anthropic", "claude-sonnet-4", {
        type: "budget",
        tokens: 2048,
      }),
    ).toEqual({ type: "budget", tokens: 2048 });
  });

  it("rejects values the model cannot use", () => {
    expect(() =>
      resolveThinking("openai", "gpt-4o", { type: "effort", level: "high" }),
    ).toThrow(/not supported/);
    expect(() =>
      resolveThinking("openai", "o3", { type: "effort", level: "none" }),
    ).toThrow(/not supported/);
    expect(() =>
      resolveThinking("dashscope", "qwq-plus", { type: "off" }),
    ).toThrow(/not supported/);
    expect(() =>
      resolveThinking("anthropic", "claude-sonnet-4", {
        type: "budget",
        tokens: 8,
      }),
    ).toThrow(/not supported/);
  });
});

describe("thinking request fields", () => {
  it("maps OpenAI effort and DashScope toggles, and omits unsupported fields", () => {
    expect(
      toOpenAIThinkingParams("openai", "o3", {
        type: "effort",
        level: "high",
      }),
    ).toEqual({ reasoning_effort: "high" });
    expect(toOpenAIThinkingParams("openai", "gpt-4o", { type: "off" })).toEqual(
      {},
    );
    expect(
      toOpenAIThinkingParams("dashscope", "qwen3-plus", { type: "off" }),
    ).toEqual({ enable_thinking: false });
    expect(
      toOpenAIThinkingParams("dashscope", "qwen3-plus", { type: "on" }),
    ).toEqual({ enable_thinking: true });
    expect(
      toOpenAIThinkingParams("dashscope", "qwq-plus", { type: "on" }),
    ).toEqual({});
    expect(
      toOpenAIThinkingParams("openai-compatible", "o3", { type: "off" }),
    ).toEqual({});
  });

  it("maps Anthropic token budgets and omits disabled thinking", () => {
    expect(
      toAnthropicThinkingParams({ type: "budget", tokens: 2048 }),
    ).toEqual({
      thinking: { type: "enabled", budget_tokens: 2048 },
    });
    expect(toAnthropicThinkingParams({ type: "off" })).toEqual({});
  });
});
