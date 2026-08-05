/**
 * SDK 工具定义的构造与 Provider schema 转换帮助函数。
 *
 * 本文件只封装工具的通用形状和错误结果；权限检查、调用顺序和 tool_use_id 归属由 Engine 管理。
 */

import type {
  ToolDefinition,
  ToolInputSchema,
  ToolContext,
  ToolResult,
} from "../types.js";

/**
 * 创建通用 ToolDefinition 时可提供的实现配置。
 *
 * 只读和并发安全都默认 false，工具实现必须主动声明才可被 Engine 并发执行。
 */
export interface ToolConfig {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  call: (
    input: any,
    context: ToolContext,
  ) => Promise<string | { data: string; is_error?: boolean }>;
  isReadOnly?: boolean;
  isConcurrencySafe?: boolean;
  prompt?: string | ((context: ToolContext) => Promise<string>);
}

/**
 * 使用保守默认值构造一个 SDK 工具定义。
 *
 * 调用失败被转换为 `tool_result` 错误而不是抛出，确保 Engine 可将失败反馈给模型并继续生命周期处理。
 */
export function defineTool(config: ToolConfig): ToolDefinition {
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
    /**
     * 执行调用方处理器，并将字符串、结构化数据或异常统一转换为引擎工具结果。
     */
    async call(input: any, context: ToolContext): Promise<ToolResult> {
      try {
        const result = await config.call(input, context);
        const output = typeof result === "string" ? result : result.data;
        const isError = typeof result === "object" && result.is_error;
        return {
          type: "tool_result",
          tool_use_id: "", // filled by engine
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

/**
 * 将 SDK 工具定义转换为 Provider 可发送的标准 schema。
 *
 * 只暴露模型需要的名称、描述和输入 schema，执行实现、权限和本地副作用不能跨越此边界。
 */
export function toApiTool(tool: ToolDefinition): {
  name: string;
  description: string;
  input_schema: ToolInputSchema;
} {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  };
}
