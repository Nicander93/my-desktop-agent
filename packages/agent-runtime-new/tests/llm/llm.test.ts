import { describe, expect, it, vi } from "vitest";
import { LLM, resolveProvider } from "@/index.js";

describe("provider", () => {
  it("resolves built-in endpoints and custom OpenAI-compatible endpoints", () => {
    expect(resolveProvider("openrouter")).toEqual({
      baseURL: "https://openrouter.ai/api/v1",
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
});
