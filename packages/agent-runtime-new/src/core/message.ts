import { randomUUID } from "node:crypto";

export type MessageId = string;

export function createMessageId(): MessageId {
  return randomUUID();
}

export type UserContent = { type: "text"; text: string };

export interface SystemMessage {
  id: MessageId;
  role: "system";
  content: string;
}

export interface UserMessage {
  id: MessageId;
  role: "user";
  content: UserContent[];
}

export interface ToolCall {
  type: "tool-call";
  id: string;
  name: string;
  input: unknown;
}

export type AssistantContent = { type: "text"; text: string } | ToolCall;

export interface AssistantMessage {
  id: MessageId;
  role: "assistant";
  content: AssistantContent[];
}

export interface ToolMessage {
  id: MessageId;
  role: "tool";
  toolCallId: string;
  content: unknown;
  isError?: boolean;
}

export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage;
