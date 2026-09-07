import { describe, expect, it, vi } from "vitest";
import {
  runAgentLoop,
  type AgentLoopInput,
  type AssistantMessage,
  type Message,
  type ToolExecutor,
  type ToolMessage,
} from "@/index.js";

function assistant(...content: AssistantMessage["content"]): AssistantMessage {
  return { id: "assistant-test", role: "assistant", content };
}

function toolMessage(
  callId: string,
  content: unknown,
  isError = false,
): ToolMessage {
  return {
    id: `tool-${callId}`,
    role: "tool",
    toolCallId: callId,
    content,
    ...(isError ? { isError: true } : {}),
  };
}

function createInput(
  llm: AgentLoopInput["llm"],
  toolExecutor: ToolExecutor,
  messages: readonly Message[] = [],
) {
  return {
    messages,
    llm,
    tools: [],
    toolExecutor,
    maxTurns: 10,
  };
}

describe("runAgentLoop", () => {
  it("completes after a direct assistant response without changing input history", async () => {
    const initialMessages: Message[] = [
      {
        id: "user-1",
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    ];
    const llm = {
      generate: vi.fn(async () => ({
        message: assistant({ type: "text", text: "hi" }),
      })),
    };
    const toolExecutor: ToolExecutor = { execute: vi.fn() };

    const result = await runAgentLoop(
      createInput(llm, toolExecutor, initialMessages),
    );

    expect(result).toEqual({
      newMessages: [assistant({ type: "text", text: "hi" })],
      turns: 1,
      stopReason: "completed",
    });
    expect(initialMessages).toEqual([
      {
        id: "user-1",
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    ]);
    expect(toolExecutor.execute).not.toHaveBeenCalled();
  });

  it("executes multiple tool calls serially and sends their results to the next model turn", async () => {
    const first = assistant(
      {
        type: "tool-call",
        id: "call-1",
        name: "read",
        input: { path: "a.txt" },
      },
      {
        type: "tool-call",
        id: "call-2",
        name: "read",
        input: { path: "b.txt" },
      },
    );
    const llm = {
      generate: vi
        .fn()
        .mockResolvedValueOnce({ message: first })
        .mockResolvedValueOnce({
          message: assistant({ type: "text", text: "done" }),
        }),
    };
    const order: string[] = [];
    const toolExecutor: ToolExecutor = {
      execute: vi.fn(async (call) => {
        order.push(call.id);
        return toolMessage(call.id, { ok: true });
      }),
    };

    const result = await runAgentLoop(createInput(llm, toolExecutor));

    expect(result.turns).toBe(2);
    expect(result.stopReason).toBe("completed");
    expect(order).toEqual(["call-1", "call-2"]);
    expect(result.newMessages).toEqual([
      first,
      toolMessage("call-1", { ok: true }),
      toolMessage("call-2", { ok: true }),
      assistant({ type: "text", text: "done" }),
    ]);
    expect(llm.generate).toHaveBeenLastCalledWith({
      messages: [
        first,
        toolMessage("call-1", { ok: true }),
        toolMessage("call-2", { ok: true }),
      ],
      tools: [],
    });
  });

  it("continues after an error tool message", async () => {
    const llm = {
      generate: vi
        .fn()
        .mockResolvedValueOnce({
          message: assistant({
            type: "tool-call",
            id: "bad-call",
            name: "read",
            input: { path: "missing.txt" },
          }),
        })
        .mockResolvedValueOnce({
          message: assistant({ type: "text", text: "recovered" }),
        }),
    };
    const toolExecutor: ToolExecutor = {
      execute: vi.fn(async () =>
        toolMessage("bad-call", { code: "FILE_NOT_FOUND" }, true),
      ),
    };

    const result = await runAgentLoop(createInput(llm, toolExecutor));

    expect(result.stopReason).toBe("completed");
    expect(result.turns).toBe(2);
    expect(result.newMessages[1]).toMatchObject({
      role: "tool",
      isError: true,
    });
  });

  it("stops normally at maxTurns", async () => {
    const llm = {
      generate: vi.fn(async (input) => ({
        message: assistant({
          type: "tool-call",
          id: `call-${input.messages.length}`,
          name: "read",
          input: { path: "again.txt" },
        }),
      })),
    };
    const toolExecutor: ToolExecutor = {
      execute: vi.fn(async (call) => toolMessage(call.id, { ok: true })),
    };

    const result = await runAgentLoop({
      ...createInput(llm, toolExecutor),
      maxTurns: 2,
    });

    expect(result.stopReason).toBe("max_turns");
    expect(result.turns).toBe(2);
    expect(llm.generate).toHaveBeenCalledTimes(2);
    expect(toolExecutor.execute).toHaveBeenCalledTimes(2);
  });

  it("emits one stable message id across a streaming assistant turn", async () => {
    const llm = {
      generate: vi.fn(),
      stream: vi.fn(async function* () {
        yield {
          sequence: 0,
          timestamp: 100,
          delta: { type: "text-delta" as const, delta: "hello" },
        };
        yield {
          sequence: 1,
          timestamp: 101,
          delta: { type: "text-delta" as const, delta: " world" },
          finishReason: "stop",
          usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 },
        };
      }),
    };
    const events: Array<import("@/index.js").AgentEvent> = [];
    const toolExecutor: ToolExecutor = { execute: vi.fn() };

    const result = await runAgentLoop({
      ...createInput(llm, toolExecutor),
      onEvent: (event) => events.push(event),
    });

    const start = events[0];
    const end = events.at(-1);
    expect(start).toMatchObject({
      type: "message-start",
      messageId: expect.any(String),
    });
    expect(events.filter((event) => event.type === "message-delta")).toEqual([
      {
        type: "message-delta",
        messageId: (start as { messageId: string }).messageId,
        delta: { type: "text-delta", delta: "hello" },
        sequence: 0,
        timestamp: 100,
      },
      {
        type: "message-delta",
        messageId: (start as { messageId: string }).messageId,
        delta: { type: "text-delta", delta: " world" },
        sequence: 1,
        timestamp: 101,
      },
    ]);
    expect(end).toMatchObject({
      type: "message-end",
      messageId: (start as { messageId: string }).messageId,
      message: {
        id: (start as { messageId: string }).messageId,
        role: "assistant",
        content: [{ type: "text", text: "hello world" }],
      },
      finishReason: "stop",
      usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 },
    });
    expect(result.newMessages).toEqual([
      expect.objectContaining({
        id: (start as { messageId: string }).messageId,
        role: "assistant",
        content: [{ type: "text", text: "hello world" }],
      }),
    ]);
    expect(llm.generate).not.toHaveBeenCalled();
  });
});
