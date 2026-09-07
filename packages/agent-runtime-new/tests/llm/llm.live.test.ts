import { describe, expect, it } from "vitest";
import {
  applyMessageDelta,
  createAssistantMessageDraft,
  finalizeAssistantMessage,
} from "@/core/message-delta.js";
import { createMessageId } from "@/core/message.js";
import { LLM } from "@/llm/llm.js";
import type { LLMStreamChunk } from "@/llm/llm.js";

const liveTestEnabled = process.env.LIVE_LLM === "1";

describe.skipIf(!liveTestEnabled)("live LLM streaming", () => {
  it(
    "assembles a streamed tool call from a real OpenAI-compatible endpoint",
    async () => {
      const apiKey = process.env.LIVE_LLM_API_KEY;
      const llm = new LLM({
        provider: "openai-compatible",
        baseURL: requiredEnvironmentVariable("LIVE_LLM_BASE_URL"),
        model: requiredEnvironmentVariable("LIVE_LLM_MODEL"),
        ...(apiKey ? { apiKey } : {}),
      });
      const messageId = createMessageId();
      const draft = createAssistantMessageDraft(messageId);
      const chunks: LLMStreamChunk[] = [];

      for await (const chunk of llm.stream({
        messages: [
          {
            id: createMessageId(),
            role: "system",
            content:
              "You are testing tool-call streaming. Call debug_echo exactly once. Do not answer with plain text.",
          },
          {
            id: createMessageId(),
            role: "user",
            content: [
              {
                type: "text",
                text: 'Call debug_echo with exactly {"value":"hello"}.',
              },
            ],
          },
        ],
        tools: [
          {
            name: "debug_echo",
            description: "Returns the provided value.",
            inputSchema: {
              type: "object",
              properties: { value: { type: "string" } },
              required: ["value"],
              additionalProperties: false,
            },
          },
        ],
      })) {
        chunks.push(chunk);
        writeDebugOutput("chunk", chunk);

        if (chunk.delta) applyMessageDelta(draft, chunk.delta);
      }

      const message = finalizeAssistantMessage(draft);
      writeDebugOutput("final-message", message);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.map((chunk) => chunk.sequence)).toEqual(
        chunks.map((_, index) => index),
      );
      expect(chunks.every((chunk) => Number.isFinite(chunk.timestamp))).toBe(
        true,
      );
      expect(
        chunks.some((chunk) => chunk.delta?.type === "tool-call-delta"),
      ).toBe(true);
      expect(message.id).toBe(messageId);
      expect(
        message.content.some((content) => content.type === "tool-call"),
      ).toBe(true);
    },
    120_000,
  );
});

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when LIVE_LLM=1.`);
  return value;
}

function writeDebugOutput(label: string, value: unknown): void {
  process.stdout.write(`[live-llm:${label}] ${JSON.stringify(value)}\n`);
}
