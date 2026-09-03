export type UserContent = { type: "text"; text: string };

export interface UserMessage {
  role: "user";
  content: UserContent[];
}

export interface ToolCall {
  type: "tool-call";
  id: string;
  name: string;
  input: unknown;
}

export type AssistantContent =
  | { type: "text"; text: string }
  | ToolCall;

export interface AssistantMessage {
  role: "assistant";
  content: AssistantContent[];
}

export interface ToolMessage {
  role: "tool";
  toolCallId: string;
  content: unknown;
  isError?: boolean;
}

export type Message = UserMessage | AssistantMessage | ToolMessage;
