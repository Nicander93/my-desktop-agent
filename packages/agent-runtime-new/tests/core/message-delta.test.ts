import { describe, expect, it } from "vitest";
import {
  applyMessageDelta,
  createAssistantMessageDraft,
  finalizeAssistantMessage,
} from "@/core/message-delta.js";

describe("message delta", () => {
  it("assembles text across multiple chunks", () => {
    const draft = createAssistantMessageDraft("assistant-1");

    applyMessageDelta(draft, { type: "text-delta", delta: "hello" });
    applyMessageDelta(draft, { type: "text-delta", delta: " world" });

    expect(finalizeAssistantMessage(draft)).toEqual({
      id: "assistant-1",
      role: "assistant",
      content: [{ type: "text", text: "hello world" }],
    });
  });

  it("assembles fragmented tool call fields and preserves malformed input", () => {
    const draft = createAssistantMessageDraft("assistant-2");

    applyMessageDelta(draft, {
      type: "tool-call-delta",
      contentIndex: 1,
      id: "call-",
      name: "rea",
      arguments: '{"path":',
    });
    applyMessageDelta(draft, {
      type: "tool-call-delta",
      contentIndex: 1,
      id: "2",
      name: "d",
      arguments: "broken",
    });

    expect(finalizeAssistantMessage(draft)).toEqual({
      id: "assistant-2",
      role: "assistant",
      content: [
        {
          type: "tool-call",
          id: "call-2",
          name: "read",
          input: '{"path":broken',
        },
      ],
    });
  });

  it("keeps thinking and text as separate content blocks", () => {
    const draft = createAssistantMessageDraft("assistant-3");

    applyMessageDelta(draft, { type: "thinking-delta", delta: "plan " });
    applyMessageDelta(draft, { type: "thinking-delta", delta: "first" });
    applyMessageDelta(draft, { type: "text-delta", delta: "done" });

    expect(finalizeAssistantMessage(draft)).toEqual({
      id: "assistant-3",
      role: "assistant",
      content: [
        { type: "thinking", text: "plan first" },
        { type: "text", text: "done" },
      ],
    });
  });

  it("does not insert empty text when only thinking arrived", () => {
    const draft = createAssistantMessageDraft("assistant-4");

    applyMessageDelta(draft, { type: "thinking-delta", delta: "ponder" });

    expect(finalizeAssistantMessage(draft)).toEqual({
      id: "assistant-4",
      role: "assistant",
      content: [{ type: "thinking", text: "ponder" }],
    });
  });
});
