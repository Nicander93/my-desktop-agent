import {
  createMessageId,
  type AssistantMessage,
  type Message,
  type ToolCall,
} from "@/core/message.js";
import {
  applyMessageDelta,
  createAssistantMessageDraft,
  finalizeAssistantMessage,
} from "@/core/message-delta.js";
import type { AgentEvent } from "@/agent/event.js";
import type { AgentLoopInput, AgentLoopResult } from "@/agent/types.js";
import type { LLMUsage } from "@/llm/llm.js";

function isToolCall(content: { type: string }): content is ToolCall {
  return content.type === "tool-call";
}

function emit(input: AgentLoopInput, event: AgentEvent): void {
  input.onEvent?.(event);
}

async function runStreamTurn(
  input: AgentLoopInput,
  messages: Message[],
): Promise<{
  message: AssistantMessage;
  finishReason?: string;
  usage?: LLMUsage;
}> {
  const messageId = createMessageId();
  const draft = createAssistantMessageDraft(messageId);
  emit(input, {
    type: "message-start",
    messageId,
    timestamp: Date.now(),
  });

  let finishReason: string | undefined;
  let usage: LLMUsage | undefined;
  if (input.llm.stream === undefined) {
    throw new Error("LLM stream is unavailable.");
  }

  for await (const chunk of input.llm.stream({
    messages: [...messages],
    tools: input.tools,
  })) {
    if (chunk.finishReason !== undefined) finishReason = chunk.finishReason;
    if (chunk.usage !== undefined) usage = chunk.usage;
    if (chunk.delta === undefined) continue;

    applyMessageDelta(draft, chunk.delta);
    emit(input, {
      type: "message-delta",
      messageId,
      delta: chunk.delta,
      sequence: chunk.sequence,
      timestamp: chunk.timestamp,
    });
  }

  const message = finalizeAssistantMessage(draft);
  return {
    message,
    finishReason,
    usage,
  };
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
    const response = input.llm.stream
      ? await runStreamTurn(input, messages)
      : await input.llm.generate({
          messages: [...messages],
          tools: input.tools,
        });
    const assistantMessage = response.message;

    messages.push(assistantMessage);
    newMessages.push(assistantMessage);

    if (input.llm.stream) {
      emit(input, {
        type: "message-end",
        messageId: assistantMessage.id,
        message: assistantMessage,
        finishReason: response.finishReason,
        usage: response.usage,
        timestamp: Date.now(),
      });
    }

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
