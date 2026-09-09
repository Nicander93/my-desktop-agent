import { createMessageId } from "@/core/message.js";
import type {
  AssistantContent,
  AssistantMessage,
  MessageId,
} from "@/core/message.js";

export interface TextDelta {
  type: "text-delta";
  delta: string;
}

export interface ThinkingDelta {
  type: "thinking-delta";
  delta: string;
}

export interface ToolCallDelta {
  type: "tool-call-delta";
  contentIndex: number;
  id?: string;
  name?: string;
  arguments?: string;
}

export type MessageDelta = TextDelta | ThinkingDelta | ToolCallDelta;

interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
}

/**
 * the intermediate state of the assistant message
 */
interface AssistantMessageDraft {
  id: MessageId;
  thinking: string;
  text: string;
  toolCalls: Map<number, PendingToolCall>;
}

export function createAssistantMessageDraft(
  messageId: MessageId = createMessageId(),
): AssistantMessageDraft {
  return { id: messageId, thinking: "", text: "", toolCalls: new Map() };
}

/**
 * organize the delta into the assistant message draft
 */
export function applyMessageDelta(
  draft: AssistantMessageDraft,
  delta: MessageDelta,
): void {
  if (delta.type === "text-delta") {
    draft.text += delta.delta;
    return;
  }

  if (delta.type === "thinking-delta") {
    draft.thinking += delta.delta;
    return;
  }

  const pending = draft.toolCalls.get(delta.contentIndex) ?? {
    id: "",
    name: "",
    arguments: "",
  };
  if (delta.id !== undefined) pending.id += delta.id;
  if (delta.name !== undefined) pending.name += delta.name;
  if (delta.arguments !== undefined) pending.arguments += delta.arguments;
  draft.toolCalls.set(delta.contentIndex, pending);
}

export function finalizeAssistantMessage(
  draft: AssistantMessageDraft,
): AssistantMessage {
  const content: AssistantContent[] = [];
  if (draft.thinking.length > 0) {
    content.push({ type: "thinking", text: draft.thinking });
  }
  if (draft.text.length > 0) content.push({ type: "text", text: draft.text });

  for (const [, call] of [...draft.toolCalls].sort(
    ([left], [right]) => left - right,
  )) {
    if (call.id.length === 0 || call.name.length === 0) {
      throw new Error("Assistant stream contains an incomplete tool call.");
    }
    content.push({
      type: "tool-call",
      id: call.id,
      name: call.name,
      input: parseToolInput(call.arguments),
    });
  }

  if (content.length === 0) content.push({ type: "text", text: "" });
  return { id: draft.id, role: "assistant", content };
}

function parseToolInput(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    // Preserve provider output for downstream validation instead of guessing a repair.
    return value;
  }
}
