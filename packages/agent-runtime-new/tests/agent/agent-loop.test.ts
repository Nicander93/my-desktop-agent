import { describe, expect, it, vi } from "vitest";
import {
  runAgentLoop,
  type AssistantMessage,
  type Message,
  type Model,
  type ToolExecutor,
  type ToolMessage,
} from "@/index.js";

function assistant(...content: AssistantMessage["content"]): AssistantMessage {
  return { role: "assistant", content };
}

function toolMessage(callId: string, content: unknown, isError = false): ToolMessage {
  return {
    role: "tool",
    toolCallId: callId,
    content,
    ...(isError ? { isError: true } : {}),
  };
}

function createInput(model: Model, toolExecutor: ToolExecutor, messages: readonly Message[] = []) {
  return {
    messages,
    model,
    tools: [],
    toolExecutor,
    maxTurns: 10,
  };
}

describe("runAgentLoop", () => {
  it("completes after a direct assistant response without changing input history", async () => {
    const initialMessages: Message[] = [
      { role: "user", content: [{ type: "text", text: "hello" }] },
    ];
    const model: Model = {
      generate: vi.fn(async () => ({ message: assistant({ type: "text", text: "hi" }) })),
    };
    const toolExecutor: ToolExecutor = { execute: vi.fn() };

    const result = await runAgentLoop(createInput(model, toolExecutor, initialMessages));

    expect(result).toEqual({
      newMessages: [assistant({ type: "text", text: "hi" })],
      turns: 1,
      stopReason: "completed",
    });
    expect(initialMessages).toEqual([
      { role: "user", content: [{ type: "text", text: "hello" }] },
    ]);
    expect(toolExecutor.execute).not.toHaveBeenCalled();
  });

  it("executes multiple tool calls serially and sends their results to the next model turn", async () => {
    const first = assistant(
      { type: "tool-call", id: "call-1", name: "read", input: { path: "a.txt" } },
      { type: "tool-call", id: "call-2", name: "read", input: { path: "b.txt" } },
    );
    const model: Model = {
      generate: vi
        .fn()
        .mockResolvedValueOnce({ message: first })
        .mockResolvedValueOnce({ message: assistant({ type: "text", text: "done" }) }),
    };
    const order: string[] = [];
    const toolExecutor: ToolExecutor = {
      execute: vi.fn(async (call) => {
        order.push(call.id);
        return toolMessage(call.id, { ok: true });
      }),
    };

    const result = await runAgentLoop(createInput(model, toolExecutor));

    expect(result.turns).toBe(2);
    expect(result.stopReason).toBe("completed");
    expect(order).toEqual(["call-1", "call-2"]);
    expect(result.newMessages).toEqual([
      first,
      toolMessage("call-1", { ok: true }),
      toolMessage("call-2", { ok: true }),
      assistant({ type: "text", text: "done" }),
    ]);
    expect(model.generate).toHaveBeenLastCalledWith({
      messages: [
        first,
        toolMessage("call-1", { ok: true }),
        toolMessage("call-2", { ok: true }),
      ],
      tools: [],
    });
  });

  it("continues after an error tool message", async () => {
    const model: Model = {
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
        .mockResolvedValueOnce({ message: assistant({ type: "text", text: "recovered" }) }),
    };
    const toolExecutor: ToolExecutor = {
      execute: vi.fn(async () =>
        toolMessage("bad-call", { code: "FILE_NOT_FOUND" }, true),
      ),
    };

    const result = await runAgentLoop(createInput(model, toolExecutor));

    expect(result.stopReason).toBe("completed");
    expect(result.turns).toBe(2);
    expect(result.newMessages[1]).toMatchObject({
      role: "tool",
      isError: true,
    });
  });

  it("stops normally at maxTurns", async () => {
    const model: Model = {
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
      ...createInput(model, toolExecutor),
      maxTurns: 2,
    });

    expect(result.stopReason).toBe("max_turns");
    expect(result.turns).toBe(2);
    expect(model.generate).toHaveBeenCalledTimes(2);
    expect(toolExecutor.execute).toHaveBeenCalledTimes(2);
  });
});
