import type { Model } from "@/model/model.js";
import type { ToolExecutor } from "@/tools/tool-executor.js";
import type { Message, ToolDefinition } from "@/model/types.js";

export type AgentStopReason = "completed" | "max_turns";

export interface AgentLoopInput {
  messages: readonly Message[];
  model: Model;
  tools: readonly ToolDefinition[];
  toolExecutor: ToolExecutor;
  maxTurns: number;
  systemPrompt?: string;
}

export interface AgentLoopResult {
  newMessages: Message[];
  turns: number;
  stopReason: AgentStopReason;
}
