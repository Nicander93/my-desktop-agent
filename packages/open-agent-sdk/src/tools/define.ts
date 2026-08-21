/**
 * ToolDefinition 工厂。调用失败转成 tool_result 错误，不抛出。
 */

import type {
  ToolDefinition,
  ToolInputSchema,
  ToolContext,
  ToolResult,
} from "./types.js";

/** defineTool 的入参；isReadOnly / isConcurrencySafe 默认 false。 */
export interface ToolConfig<Input = any> {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  call: (
    input: Input,
    context: ToolContext,
  ) => Promise<string | { data: string; is_error?: boolean }>;
  isReadOnly?: boolean;
  isConcurrencySafe?: boolean;
  prompt?: string | ((context: ToolContext) => Promise<string>);
}

export function defineTool<Input = any>(
  config: ToolConfig<Input>,
): ToolDefinition<Input> {
  return {
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    isReadOnly: () => config.isReadOnly ?? false,
    isConcurrencySafe: () => config.isConcurrencySafe ?? false,
    isEnabled: () => true,
    prompt:
      typeof config.prompt === "function"
        ? config.prompt
        : async (_context: ToolContext) =>
            (config.prompt as string) ?? config.description,
    async call(input: Input, context: ToolContext): Promise<ToolResult> {
      try {
        const result = await config.call(input, context);
        const output = typeof result === "string" ? result : result.data;
        const isError = typeof result === "object" && result.is_error;
        return {
          type: "tool_result",
          tool_use_id: "", // 由 Engine层 填
          content: output,
          is_error: isError || false,
        };
      } catch (err: any) {
        return {
          type: "tool_result",
          tool_use_id: "",
          content: `Error: ${err.message}`,
          is_error: true,
        };
      }
    },
  };
}
