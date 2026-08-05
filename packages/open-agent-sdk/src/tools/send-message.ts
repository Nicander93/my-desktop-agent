/**
 * SendMessageTool - Inter-agent messaging
 *
 * Supports plain text and structured protocol messages
 * between teammates in a multi-agent setup.
 */

import type { ToolDefinition, ToolResult } from "../types.js";

/**
 * Message inbox for inter-agent communication.
 */
export interface AgentMessage {
  from: string;
  to: string;
  content: string;
  timestamp: string;
  type:
    | "text"
    | "shutdown_request"
    | "shutdown_response"
    | "plan_approval_response";
}

const mailboxes = new Map<string, AgentMessage[]>();

/**
 * Read messages from a mailbox.
 */
export function readMailbox(agentName: string): AgentMessage[] {
  const messages = mailboxes.get(agentName) || [];
  mailboxes.set(agentName, []); // Clear after reading
  return messages;
}

/**
 * Write to a mailbox.
 */
export function writeToMailbox(agentName: string, message: AgentMessage): void {
  const messages = mailboxes.get(agentName) || [];
  messages.push(message);
  mailboxes.set(agentName, messages);
}

/**
 * Clear all mailboxes.
 */
export function clearMailboxes(): void {
  mailboxes.clear();
}

export const SendMessageTool: ToolDefinition = {
  name: "SendMessage",
  description:
    "Send a message to another agent or teammate. Supports plain text and structured protocol messages.",
  inputSchema: {
    type: "object",
    properties: {
      to: {
        type: "string",
        description: 'Recipient agent name or ID. Use "*" for broadcast.',
      },
      content: { type: "string", description: "Message content" },
      type: {
        type: "string",
        enum: [
          "text",
          "shutdown_request",
          "shutdown_response",
          "plan_approval_response",
        ],
        description: "Message type (default: text)",
      },
    },
    required: ["to", "content"],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => true,
  isEnabled: () => true,
  /**
   * 告知模型该工具向协作 Agent 邮箱发送结构化消息。
   */
  async prompt() {
    return "Send a message to another agent.";
  },
  /**
   * 写入目标邮箱；`*` 会向已知邮箱广播同一消息副本。
   */
  async call(input: any): Promise<ToolResult> {
    const message: AgentMessage = {
      from: "self",
      to: input.to,
      content: input.content,
      timestamp: new Date().toISOString(),
      type: input.type || "text",
    };

    if (input.to === "*") {
      // Broadcast to all known mailboxes
      for (const [name] of mailboxes) {
        writeToMailbox(name, { ...message, to: name });
      }
      return {
        type: "tool_result",
        tool_use_id: "",
        content: `Message broadcast to all agents`,
      };
    }

    writeToMailbox(input.to, message);
    return {
      type: "tool_result",
      tool_use_id: "",
      content: `Message sent to ${input.to}`,
    };
  },
};
