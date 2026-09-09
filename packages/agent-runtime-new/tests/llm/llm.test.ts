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

  it("applies catalog thinking defaults on the request body", async () => {
    const openaiCapture: { body?: Record<string, unknown> } = {};
    const openai = new LLM({
      provider: "openai",
      model: "o3",
      apiKey: "secret",
      fetch: chatCompletionsFetch(openaiCapture) as typeof fetch,
    });
    expect(openai.thinking).toEqual({ type: "effort", level: "medium" });
    await openai.generate(userTurn());
    expect(openaiCapture.body).toMatchObject({ reasoning_effort: "medium" });

    const chatCapture: { body?: Record<string, unknown> } = {};
    const chat = new LLM({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "secret",
      fetch: chatCompletionsFetch(chatCapture) as typeof fetch,
    });
    expect(chat.thinking).toEqual({ type: "off" });
    await chat.generate(userTurn());
    expect(chatCapture.body).not.toHaveProperty("reasoning_effort");
    expect(chatCapture.body).not.toHaveProperty("enable_thinking");

    const dashscopeCapture: { body?: Record<string, unknown> } = {};
    const dashscope = new LLM({
      provider: "dashscope",
      model: "qwen3-plus",
      apiKey: "secret",
      fetch: chatCompletionsFetch(dashscopeCapture) as typeof fetch,
    });
    expect(dashscope.thinking).toEqual({ type: "off" });
    await dashscope.generate(userTurn());
    expect(dashscopeCapture.body).toMatchObject({ enable_thinking: false });
  });

  it("rejects thinking that the selected model cannot use", () => {
    expect(
      () =>
        new LLM({
          provider: "openai",
          model: "gpt-4o",
          apiKey: "secret",
          thinking: { type: "effort", level: "high" },
        }),
    ).toThrow(/not supported/);
  });
});

function userTurn() {
  return {
    messages: [
      {
        id: "user-1",
        role: "user" as const,
        content: [{ type: "text" as const, text: "Hi" }],
      },
    ],
    tools: [],
  };
}

function chatCompletionsFetch(capture: { body?: Record<string, unknown> }) {
  return vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    capture.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: { role: "assistant", content: "Hello" },
            finish_reason: "stop",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
}
