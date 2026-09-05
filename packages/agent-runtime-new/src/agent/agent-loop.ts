import type { ToolCall } from "@/core/message.js";
import type { AgentLoopInput, AgentLoopResult } from "@/agent/types.js";

function isToolCall(content: { type: string }): content is ToolCall {
  return content.type === "tool-call";
}

/**
 * Runs LLM turns against a caller-owned message history and returns only messages produced here.
 */
export async function runAgentLoop(
  input: AgentLoopInput,
): Promise<AgentLoopResult> {
  const messages = [...input.messages];
  const newMessages: AgentLoopResult["newMessages"] = [];

  for (let turn = 0; turn < input.maxTurns; turn += 1) {
    const llmInput = {
      messages: [...messages],
      tools: input.tools,
      ...(input.systemPrompt === undefined
        ? {}
        : { systemPrompt: input.systemPrompt }),
    };
    const response = await input.llm.generate(llmInput);
    const assistantMessage = response.message;

    messages.push(assistantMessage);
    newMessages.push(assistantMessage);

    const toolCalls = assistantMessage.content.filter(isToolCall);
    if (toolCalls.length === 0) {
      return {
        newMessages,
        turns: turn + 1,
        stopReason: "completed",
      };
    }

    for (const call of toolCalls) {
      const toolMessage = await input.toolExecutor.execute(call);
      messages.push(toolMessage);
      newMessages.push(toolMessage);
    }
  }

  return {
    newMessages,
    turns: input.maxTurns,
    stopReason: "max_turns",
  };
}
