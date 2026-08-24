export interface UserMessage {
  role: "user";
  content: string;
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

/**
 * Provider-facing metadata for a tool; input schema support is reserved for a later phase.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  category?: "general" | "domain";
  inputSchema?: unknown;
}
