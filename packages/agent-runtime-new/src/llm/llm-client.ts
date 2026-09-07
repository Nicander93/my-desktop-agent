import type { AssistantMessage, Message } from "@/core/message.js";
import type { MessageDelta } from "@/core/message-delta.js";
import type { ToolDefinition } from "@/core/tool.js";

export interface LLMInput {
  messages: readonly Message[];
  tools: readonly ToolDefinition[];
  signal?: AbortSignal;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  message: AssistantMessage;
  finishReason?: string;
  usage?: LLMUsage;
}

export interface LLMStreamChunk {
  sequence: number;
  timestamp: number;
  delta?: MessageDelta;
  finishReason?: string;
  usage?: LLMUsage;
}

/**
 * Internal protocol implemented by provider clients.
 */
export interface LLMClient {
  generate(input: LLMInput): Promise<LLMResponse>;
  stream(input: LLMInput): AsyncIterable<LLMStreamChunk>;
}
