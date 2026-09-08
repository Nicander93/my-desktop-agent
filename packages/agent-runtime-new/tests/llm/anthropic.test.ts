import { describe, expect, it, vi } from "vitest";
import {
  AnthropicError,
  AnthropicClient,
} from "@/llm/anthropic-client.js";

function anthropicSSE(
  event: string,
  data: Record<string, unknown>,
): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

describe("AnthropicClient", () => {
  it("converts conversation history, tools, and the assistant response", async () => {
    let requestBody: Record<string, unknown> | undefined;
    let requestHeaders: HeadersInit | undefined;
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        requestHeaders = init?.headers;
        return new Response(
          JSON.stringify({
            id: "msg_1",
            type: "message",
            role: "assistant",
            model: "test-model",
            content: [
              { type: "text", text: "The file says hello." },
              {
                type: "tool_use",
                id: "call-2",
                name: "read",
                input: { path: "b.txt" },
              },
            ],
            stop_reason: "tool_use",
            stop_sequence: null,
            usage: { input_tokens: 12, output_tokens: 7 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );
    const client = new AnthropicClient({
      baseURL: "https://example.test/",
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
        {
          id: "tool-2",
          role: "tool",
          toolCallId: "call-1b",
          content: { content: "also" },
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
      "https://example.test/v1/messages",
      expect.objectContaining({ method: "POST" }),
    );
    expect(requestBody).toMatchObject({
      model: "test-model",
      max_tokens: 512,
      temperature: 0.2,
      system: "Be concise.",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Read a.txt" }],
        },
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "call-1",
              name: "read",
              input: { path: "a.txt" },
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "call-1",
              content: '{"content":"hello"}',
            },
            {
              type: "tool_result",
              tool_use_id: "call-1b",
              content: '{"content":"also"}',
            },
          ],
        },
      ],
      tools: [
        {
          name: "read",
          description: "Read a file",
          input_schema: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
          },
        },
      ],
    });
    const headers = new Headers(requestHeaders);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("x-api-key")).toBe("secret");
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
      finishReason: "tool_use",
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
          max_tokens: 4096,
        });

        const bodyText = [
          anthropicSSE("message_start", {
            type: "message_start",
            message: {
              id: "msg_1",
              type: "message",
              role: "assistant",
              model: "test-model",
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 8, output_tokens: 1 },
            },
          }),
          anthropicSSE("content_block_start", {
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
          }),
          anthropicSSE("content_block_delta", {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "Reading " },
          }),
          anthropicSSE("content_block_delta", {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "the file." },
          }),
          anthropicSSE("content_block_stop", {
            type: "content_block_stop",
            index: 0,
          }),
          anthropicSSE("content_block_start", {
            type: "content_block_start",
            index: 1,
            content_block: {
              type: "tool_use",
              id: "call-1",
              name: "read",
              input: {},
            },
          }),
          anthropicSSE("content_block_delta", {
            type: "content_block_delta",
            index: 1,
            delta: { type: "input_json_delta", partial_json: '{"path":' },
          }),
          anthropicSSE("content_block_delta", {
            type: "content_block_delta",
            index: 1,
            delta: { type: "input_json_delta", partial_json: '"a.txt"}' },
          }),
          anthropicSSE("content_block_stop", {
            type: "content_block_stop",
            index: 1,
          }),
          anthropicSSE("message_delta", {
            type: "message_delta",
            delta: { stop_reason: "tool_use", stop_sequence: null },
            usage: { output_tokens: 5 },
          }),
          anthropicSSE("message_stop", { type: "message_stop" }),
        ].join("");

        return new Response(bodyText, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      },
    );
    const client = new AnthropicClient({
      baseURL: "https://example.test",
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

    expect(events).toHaveLength(6);
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
          contentIndex: 1,
          id: "call-1",
          name: "read",
        },
      },
      {
        sequence: 3,
        timestamp: expect.any(Number),
        delta: {
          type: "tool-call-delta",
          contentIndex: 1,
          arguments: '{"path":',
        },
      },
      {
        sequence: 4,
        timestamp: expect.any(Number),
        delta: {
          type: "tool-call-delta",
          contentIndex: 1,
          arguments: '"a.txt"}',
        },
      },
      {
        sequence: 5,
        timestamp: expect.any(Number),
        finishReason: "tool_use",
        usage: { inputTokens: 8, outputTokens: 5, totalTokens: 13 },
      },
    ]);
  });

  it("preserves HTTP failure details without exposing credentials", async () => {
    const client = new AnthropicClient({
      baseURL: "https://example.test",
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
      name: "AnthropicError",
      status: 503,
    } satisfies Partial<AnthropicError>);
    await expect(promise).rejects.not.toThrow(/secret/);
  });

  it("rejects malformed successful responses", async () => {
    const client = new AnthropicClient({
      baseURL: "https://example.test",
      model: "test-model",
      apiKey: "secret",
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
    ).rejects.toThrow("does not contain content");
  });
});
