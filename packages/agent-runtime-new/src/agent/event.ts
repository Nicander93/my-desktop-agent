import type { AssistantMessage, MessageId } from "@/core/message.js";
import type { MessageDelta } from "@/core/message-delta.js";
import type { LLMUsage } from "@/llm/llm.js";

export interface MessageStartEvent {
  type: "message-start";
  messageId: MessageId;
  timestamp: number;
}

export interface MessageDeltaEvent {
  type: "message-delta";
  messageId: MessageId;
  delta: MessageDelta;
  sequence: number;
  timestamp: number;
}

export interface MessageEndEvent {
  type: "message-end";
  messageId: MessageId;
  message: AssistantMessage;
  finishReason?: string;
  usage?: LLMUsage;
  timestamp: number;
}

export type AgentEvent =
  | MessageStartEvent
  | MessageDeltaEvent
  | MessageEndEvent;
