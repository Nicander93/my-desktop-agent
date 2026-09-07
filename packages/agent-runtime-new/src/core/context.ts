import type { Message } from "@/core/message.js";
import type { Tool } from "@/core/tool.js";

/**
 * The complete context visible to the model during an agent turn.
 */
export interface AgentContext {
  readonly messages: readonly Message[];
  readonly tools: readonly Tool<unknown, unknown>[];
}
