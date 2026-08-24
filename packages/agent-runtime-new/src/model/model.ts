import type {
  AssistantMessage,
  Message,
  ToolDefinition,
} from "@/model/types.js";

export interface ModelInput {
  messages: readonly Message[];
  tools: readonly ToolDefinition[];
  systemPrompt?: string;
}

export interface ModelResponse {
  message: AssistantMessage;
}

export interface Model {
  generate(input: ModelInput): Promise<ModelResponse>;
}
