import { describe, expect, it } from "vitest";
import {
  runAgentLoop,
  type AgentEvent,
  type AssistantContent,
  type AssistantMessage,
  type Message,
  type ToolCall,
  type ToolDefinition,
  type ToolMessage,
} from "@/index.js";
import { createMessageId } from "@/core/message.js";
import { LLM } from "@/llm/llm.js";

const liveTestEnabled = process.env.LIVE_LLM === "1";
const liveTimeoutMs = 180_000;

const debugEchoTool: ToolDefinition = {
  name: "debug_echo",
  description: "Returns the provided value.",
  inputSchema: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
    additionalProperties: false,
  },
};

describe.skipIf(!liveTestEnabled)("live agent loop", () => {
  it(
    "emits one stable message id and well-formed assistant content",
    async () => {
      const initialMessages: Message[] = [
        {
          id: createMessageId(),
          role: "user",
          content: [{ type: "text", text: "Reply with a single short word." }],
        },
      ];
      const snapshot = structuredClone(initialMessages);
      const events: AgentEvent[] = [];

      const result = await runAgentLoop({
        messages: initialMessages,
        llm: createLiveLLM(),
        tools: [],
        toolExecutor: {
          execute: async () => {
            throw new Error("live agent loop did not expect a tool call");
          },
        },
        maxTurns: 3,
        onEvent: (event) => {
          events.push(event);
          writeDebugOutput("event", event);
        },
      });

      writeDebugOutput("result", result);

      const turns = streamTurns(events);
      expect(turns).toHaveLength(1);
      const turn = turns[0] ?? [];
      const messageId = expectStableStreamTurn(turn);
      const assistant = result.messages[0];
      expect(result).toMatchObject({
        stopReason: "completed",
        turns: 1,
      });
      expect(result.messages).toHaveLength(1);
      expect(assistant).toMatchObject({
        id: messageId,
        role: "assistant",
      });
      expectAssistantContent(assistantContent(assistant), {
        allowToolCalls: false,
        requireText: true,
      });
      expect(events.at(-1)).toMatchObject({
        type: "message-end",
        message: assistant,
      });
      expectDeltasMatchContent(turn, assistantContent(assistant));
      expect(initialMessages).toEqual(snapshot);
    },
    liveTimeoutMs,
  );

  it(
    "executes a streamed tool call and continues to a final assistant message",
    async () => {
      const toolResult = { echoed: "pong" };
      const executed: ToolCall[] = [];
      const events: AgentEvent[] = [];

      const result = await runAgentLoop({
        messages: [
          {
            id: createMessageId(),
            role: "system",
            content:
              "You are testing tool use. Call debug_echo exactly once. Do not answer with plain text until you have received the tool result.",
          },
          {
            id: createMessageId(),
            role: "user",
            content: [
              {
                type: "text",
                text: 'Call debug_echo with exactly {"value":"hello"}. After the tool result, reply with a single short word.',
              },
            ],
          },
        ],
        llm: createLiveLLM(),
        tools: [debugEchoTool],
        toolExecutor: {
          execute: async (call) => {
            executed.push(call);
            const message: ToolMessage = {
              id: createMessageId(),
              role: "tool",
              toolCallId: call.id,
              content: toolResult,
            };
            return message;
          },
        },
        maxTurns: 3,
        onEvent: (event) => {
          events.push(event);
          writeDebugOutput("event", event);
        },
      });

      writeDebugOutput("result", result);

      expect(result.stopReason).toBe("completed");
      expect(result.turns).toBeGreaterThanOrEqual(2);

      const first = result.messages[0];
      const last = result.messages.at(-1);
      expect(first?.role).toBe("assistant");
      expect(last?.role).toBe("assistant");
      expectAssistantContent(assistantContent(first), {
        allowToolCalls: true,
        requireText: false,
      });
      const toolCalls = assistantContent(first).filter(
        (block): block is ToolCall => block.type === "tool-call",
      );
      expect(toolCalls.length).toBeGreaterThan(0);
      expect(toolCalls.every((call) => call.name === "debug_echo")).toBe(true);
      expect(executed.slice(0, toolCalls.length).map((call) => call.id)).toEqual(
        toolCalls.map((call) => call.id),
      );
      expect(result.messages.slice(1, 1 + toolCalls.length)).toEqual(
        toolCalls.map((call) =>
          expect.objectContaining({
            role: "tool",
            toolCallId: call.id,
            content: toolResult,
          }),
        ),
      );

      expectAssistantContent(assistantContent(last), {
        allowToolCalls: false,
        requireText: true,
      });

      const turns = streamTurns(events);
      expect(turns).toHaveLength(result.turns);
      const assistants = result.messages.filter(
        (message): message is AssistantMessage => message.role === "assistant",
      );
      for (const [index, turn] of turns.entries()) {
        const messageId = expectStableStreamTurn(turn);
        const produced = assistants[index];
        expect(produced).toMatchObject({ id: messageId, role: "assistant" });
        expectDeltasMatchContent(turn, assistantContent(produced));
      }
    },
    liveTimeoutMs,
  );
});

function createLiveLLM(): LLM {
  const apiKey = process.env.LIVE_LLM_API_KEY;
  return new LLM({
    provider: "openai-compatible",
    baseURL: requiredEnvironmentVariable("LIVE_LLM_BASE_URL"),
    model: requiredEnvironmentVariable("LIVE_LLM_MODEL"),
    ...(apiKey ? { apiKey } : {}),
  });
}

function expectAssistantContent(
  content: AssistantContent[],
  options: { allowToolCalls: boolean; requireText: boolean },
): void {
  expect(content.length).toBeGreaterThan(0);
  let seenText = false;
  let seenToolCall = false;
  let thinkingBlocks = 0;

  for (const block of content) {
    switch (block.type) {
      case "thinking":
        expect(seenText || seenToolCall).toBe(false);
        expect(typeof block.text).toBe("string");
        thinkingBlocks += 1;
        expect(thinkingBlocks).toBe(1);
        break;
      case "text":
        expect(seenToolCall).toBe(false);
        expect(seenText).toBe(false);
        expect(typeof block.text).toBe("string");
        seenText = true;
        break;
      case "tool-call":
        expect(options.allowToolCalls).toBe(true);
        expect(block.id.length).toBeGreaterThan(0);
        expect(block.name.length).toBeGreaterThan(0);
        expect(block).toHaveProperty("input");
        seenToolCall = true;
        break;
      default: {
        const unexpected: never = block;
        throw new Error(`unexpected assistant content: ${JSON.stringify(unexpected)}`);
      }
    }
  }

  if (options.requireText) expect(seenText).toBe(true);
  if (!options.allowToolCalls) expect(seenToolCall).toBe(false);
}

function expectStableStreamTurn(events: AgentEvent[]): string {
  const start = events[0];
  const end = events.at(-1);
  expect(start).toMatchObject({
    type: "message-start",
    messageId: expect.any(String),
  });
  if (start?.type !== "message-start") {
    throw new Error("expected message-start");
  }
  const { messageId } = start;
  const deltas = events.filter((event) => event.type === "message-delta");
  expect(deltas.length).toBeGreaterThan(0);
  expect(deltas.every((event) => event.messageId === messageId)).toBe(true);
  expect(end).toMatchObject({
    type: "message-end",
    messageId,
  });
  return messageId;
}

function expectDeltasMatchContent(
  events: AgentEvent[],
  content: AssistantContent[],
): void {
  const thinking = content.find((block) => block.type === "thinking");
  expect(joinedDeltas(events, "thinking-delta")).toBe(
    thinking?.type === "thinking" ? thinking.text : "",
  );
  const text = content.find((block) => block.type === "text");
  expect(joinedDeltas(events, "text-delta")).toBe(
    text?.type === "text" ? text.text : "",
  );
}

function assistantContent(message: Message | undefined): AssistantContent[] {
  return message?.role === "assistant" ? message.content : [];
}

function joinedDeltas(
  events: AgentEvent[],
  type: "thinking-delta" | "text-delta",
): string {
  let text = "";
  for (const event of events) {
    if (event.type === "message-delta" && event.delta.type === type) {
      text += event.delta.delta;
    }
  }
  return text;
}

function streamTurns(events: AgentEvent[]): AgentEvent[][] {
  const turns: AgentEvent[][] = [];
  for (const event of events) {
    if (event.type === "message-start") {
      turns.push([event]);
      continue;
    }
    const current = turns.at(-1);
    if (!current) throw new Error("message-delta/end before message-start");
    current.push(event);
  }
  return turns;
}

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when LIVE_LLM=1.`);
  return value;
}

function writeDebugOutput(label: string, value: unknown): void {
  process.stdout.write(`[live-agent-loop:${label}] ${JSON.stringify(value)}\n`);
}
