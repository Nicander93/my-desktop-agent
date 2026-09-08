import { describe, expect, it, vi } from "vitest";
import { LLM, resolveProvider } from "@/index.js";

describe("provider", () => {
  it("resolves built-in endpoints and custom OpenAI-compatible endpoints", () => {
    expect(resolveProvider("openrouter")).toEqual({
      baseURL: "https://openrouter.ai/api/v1",
      apiKeyRequired: true,
    });
    expect(resolveProvider("anthropic")).toEqual({
      baseURL: "https://api.anthropic.com",
      apiKeyRequired: true,
    });
    expect(resolveProvider("ollama")).toEqual({
      baseURL: "http://localhost:11434/v1",
      apiKeyRequired: false,
    });
    expect(
      resolveProvider("openai-compatible", "http://localhost:8000/v1"),
    ).toEqual({
      baseURL: "http://localhost:8000/v1",
      apiKeyRequired: false,
    });
    expect(resolveProvider("openrouter", "https://proxy.example/v1")).toEqual({
      baseURL: "https://proxy.example/v1",
      apiKeyRequired: true,
    });
    expect(() => resolveProvider("openai-compatible")).toThrow(
      "baseURL is required for openai-compatible provider",
    );
  });

  it("requires credentials for providers that need an API key", () => {
    expect(
      () =>
        new LLM({
          provider: "openai",
          model: "gpt-4o",
        }),
    ).toThrow("apiKey is required for openai provider");
  });
});

describe("LLM", () => {
  it("uses the resolved provider endpoint through the public API", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: { role: "assistant", content: "Hello" },
                finish_reason: "stop",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    const llm = new LLM({
      provider: "openai-compatible",
      model: "test-model",
      baseURL: "https://example.test/v1",
      fetch: fetchMock as typeof fetch,
    });

    await expect(
      llm.generate({
        messages: [
          {
            id: "user-1",
            role: "user",
            content: [{ type: "text", text: "Hi" }],
          },
        ],
        tools: [],
      }),
    ).resolves.toMatchObject({
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Hello" }],
      },
      finishReason: "stop",
    });
    expect(llm.provider).toBe("openai-compatible");
    expect(llm.model).toBe("test-model");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses an explicit baseURL instead of the named provider default", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: { role: "assistant", content: "Hello" },
                finish_reason: "stop",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    const llm = new LLM({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "secret",
      baseURL: "https://proxy.example/v1",
      fetch: fetchMock as typeof fetch,
    });

    await llm.generate({
      messages: [
        { id: "user-1", role: "user", content: [{ type: "text", text: "Hi" }] },
      ],
      tools: [],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://proxy.example/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("routes anthropic through the Messages API", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "msg_1",
            type: "message",
            role: "assistant",
            model: "claude-test",
            content: [{ type: "text", text: "Hello" }],
            stop_reason: "end_turn",
            stop_sequence: null,
            usage: { input_tokens: 4, output_tokens: 2 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    const llm = new LLM({
      provider: "anthropic",
      model: "claude-test",
      apiKey: "secret",
      fetch: fetchMock as typeof fetch,
    });

    await expect(
      llm.generate({
        messages: [
          {
            id: "user-1",
            role: "user",
            content: [{ type: "text", text: "Hi" }],
          },
        ],
        tools: [],
      }),
    ).resolves.toMatchObject({
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Hello" }],
      },
      finishReason: "end_turn",
    });
    expect(llm.provider).toBe("anthropic");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
