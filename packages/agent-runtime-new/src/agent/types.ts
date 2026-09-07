import type { LLM } from "@/llm/llm.js";
import type { ToolExecutor } from "@/tools/executor.js";
import type { Message } from "@/core/message.js";
import type { ToolDefinition } from "@/core/tool.js";
import type { AgentEvent } from "@/agent/event.js";

export type AgentStopReason = "completed" | "max_turns";

export interface AgentLoopInput {
  messages: readonly Message[];
  llm: Pick<LLM, "generate"> & Partial<Pick<LLM, "stream">>;
  tools: readonly ToolDefinition[];
  toolExecutor: ToolExecutor;
  maxTurns: number;
  onEvent?: (event: AgentEvent) => void;
}

export interface AgentLoopResult {
  newMessages: Message[];
  turns: number;
  stopReason: AgentStopReason;
}
