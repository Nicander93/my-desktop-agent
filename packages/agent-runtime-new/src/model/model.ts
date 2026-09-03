import type { AssistantMessage, Message } from "@/core/message.js";
import type { ToolDefinition } from "@/core/tool.js";

export interface ModelInput {
  messages: readonly Message[];
  tools: readonly ToolDefinition[];
  systemPrompt?: string;
  signal?: AbortSignal;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ModelResponse {
  message: AssistantMessage;
  finishReason?: string;
  usage?: ModelUsage;
}

export type ModelStreamEvent =
  | { type: "text-delta"; delta: string }
  | { type: "response"; response: ModelResponse };

export interface Model {
  generate(input: ModelInput): Promise<ModelResponse>;
}

/**
 * A model that exposes incremental output and always terminates with one complete response.
 */
export interface StreamingModel extends Model {
  stream(input: ModelInput): AsyncIterable<ModelStreamEvent>;
}
