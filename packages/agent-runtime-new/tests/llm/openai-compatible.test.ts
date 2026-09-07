import { describe, expect, it, vi } from "vitest";
import {
  OpenAICompatibleError,
  OpenAICompatibleClient,
} from "@/llm/openai-compatible.js";

describe("OpenAICompatibleClient", () => {
  it("converts conversation history, tools, and the assistant response", async () => {
    let requestBody: Record<string, unknown> | undefined;
    let requestHeaders: HeadersInit | undefined;
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        requestHeaders = init?.headers;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "The file says hello.",
                  tool_calls: [
                    {
                      id: "call-2",
                      type: "function",
                      function: {
                        name: "read",
                        arguments: '{"path":"b.txt"}',
                      },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
            usage: {
              prompt_tokens: 12,
              completion_tokens: 7,
              total_tokens: 19,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );
    const client = new OpenAICompatibleClient({
      baseURL: "https://example.test/v1/",
      model: "test-model",
      apiKey: "secret",
      headers: { "X-Test": "yes" },
      maxTokens: 512,
      temperature: 0.2,
      fetch: fetchMock as typeof fetch,
    });

    const result = await client.generate({
      messages: [
        { id: "system-1", role: "system", content: "Be concise." },
        {
          id: "user-1",
          role: "user",
          content: [{ type: "text", text: "Read a.txt" }],
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: [
            {
              type: "tool-call",
              id: "call-1",
              name: "read",
              input: { path: "a.txt" },
            },
          ],
        },
        {
          id: "tool-1",
          role: "tool",
          toolCallId: "call-1",
          content: { content: "hello" },
        },
      ],
      tools: [
        {
          name: "read",
          description: "Read a file",
          inputSchema: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
          },
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(requestBody).toEqual({
      model: "test-model",
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "Read a.txt" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: {
                name: "read",
                arguments: '{"path":"a.txt"}',
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call-1",
          content: '{"content":"hello"}',
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "read",
            description: "Read a file",
            parameters: {
              type: "object",
              properties: { path: { type: "string" } },
              required: ["path"],
            },
          },
        },
      ],
      max_tokens: 512,
      temperature: 0.2,
    });
    const headers = new Headers(requestHeaders);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer secret");
    expect(headers.get("X-Test")).toBe("yes");
    expect(result).toMatchObject({
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "The file says hello." },
          {
            type: "tool-call",
            id: "call-2",
            name: "read",
            input: { path: "b.txt" },
          },
        ],
      },
      finishReason: "tool_calls",
      usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
    });
    expect(result.message.id).toEqual(expect.any(String));
  });

  it("streams standardized text and tool call chunks", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body).toMatchObject({
          model: "test-model",
          stream: true,
          stream_options: { include_usage: true },
        });

        const chunks = [
          {
            choices: [
              { index: 0, delta: { content: "Reading " }, finish_reason: null },
            ],
          },
          {
            choices: [
              {
                index: 0,
                delta: {
                  content: "the file.",
                  tool_calls: [
                    {
                      index: 0,
                      id: "call-1",
                      type: "function",
                      function: { name: "read", arguments: '{"path":' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          {
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    { index: 0, function: { arguments: '"a.txt"}' } },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
          },
          {
            choices: [],
            usage: { prompt_tokens: 8, completion_tokens: 5, total_tokens: 13 },
          },
        ].map((chunk, index) => ({
          id: `chunk-${index}`,
          object: "chat.completion.chunk",
          created: 1,
          model: "test-model",
          ...chunk,
        }));
        const bodyText = `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`;
        return new Response(bodyText, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      },
    );
    const client = new OpenAICompatibleClient({
      baseURL: "https://example.test/v1",
      model: "test-model",
      apiKey: "secret",
      fetch: fetchMock as typeof fetch,
    });

    const events = [];
    for await (const event of client.stream({
      messages: [
        {
          id: "user-1",
          role: "user",
          content: [{ type: "text", text: "read" }],
        },
      ],
      tools: [],
    })) {
      events.push(event);
    }

    expect(events).toHaveLength(5);
    expect(events).toMatchObject([
      {
        sequence: 0,
        timestamp: expect.any(Number),
        delta: { type: "text-delta", delta: "Reading " },
      },
      {
        sequence: 1,
        timestamp: expect.any(Number),
        delta: { type: "text-delta", delta: "the file." },
      },
      {
        sequence: 2,
        timestamp: expect.any(Number),
        delta: {
          type: "tool-call-delta",
          contentIndex: 0,
          id: "call-1",
          name: "read",
          arguments: '{"path":',
        },
      },
      {
        sequence: 3,
        timestamp: expect.any(Number),
        delta: {
          type: "tool-call-delta",
          contentIndex: 0,
          arguments: '"a.txt"}',
        },
        finishReason: "tool_calls",
      },
      {
        sequence: 4,
        timestamp: expect.any(Number),
        usage: { inputTokens: 8, outputTokens: 5, totalTokens: 13 },
      },
    ]);
  });

  it("preserves HTTP failure details without exposing credentials", async () => {
    const client = new OpenAICompatibleClient({
      baseURL: "https://example.test/v1",
      model: "test-model",
      apiKey: "secret",
      fetch: vi.fn(
        async () =>
          new Response('{"error":"unavailable"}', {
            status: 503,
            statusText: "Service Unavailable",
          }),
      ) as typeof fetch,
    });

    const promise = client.generate({
      messages: [
        {
          id: "user-1",
          role: "user",
          content: [{ type: "text", text: "hello" }],
        },
      ],
      tools: [],
    });

    await expect(promise).rejects.toMatchObject({
      name: "OpenAICompatibleError",
      status: 503,
      responseBody: '{"error":"unavailable"}',
    } satisfies Partial<OpenAICompatibleError>);
    await expect(promise).rejects.not.toThrow(/secret/);
  });

  it("rejects malformed successful responses", async () => {
    const client = new OpenAICompatibleClient({
      baseURL: "http://localhost:11434/v1",
      model: "local-model",
      fetch: vi.fn(
        async () => new Response("{}", { status: 200 }),
      ) as typeof fetch,
    });

    await expect(
      client.generate({
        messages: [
          {
            id: "user-1",
            role: "user",
            content: [{ type: "text", text: "hello" }],
          },
        ],
        tools: [],
      }),
    ).rejects.toThrow("does not contain choices");
  });
});
