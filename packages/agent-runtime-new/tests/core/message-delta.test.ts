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
});
