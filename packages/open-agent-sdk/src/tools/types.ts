/**
 * SDK 工具契约。不要 import 根 types.ts，会循环引用。
 */

export interface ToolDefinition<Input = any> {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  call: (input: Input, context: ToolContext) => Promise<ToolResult>;
  isReadOnly?: () => boolean;
  isConcurrencySafe?: () => boolean;
  isEnabled?: () => boolean;
  prompt?: (context: ToolContext) => Promise<string>;
  validateInput?(
    input: Input,
    context: ToolUseContext,
  ): Promise<ValidationResult<Input>>;
  checkPermissions?(
    input: Input,
    context: ToolUseContext,
  ): Promise<PermissionResult<Input>>;
}

/** JSON Schema 子集，传给 Provider。 */
export interface ToolInputSchema {
  type: "object";
  properties: Record<string, any>;
  required?: string[];
}

export interface ToolContext {
  cwd: string;
  abortSignal?: AbortSignal;
  /** 子 agent 继承父 agent 的 provider/model/apiType。 */
  provider?: import("../providers/types.js").LLMProvider;
  model?: string;
  apiType?: import("../providers/types.js").ApiType;
  /** 会话级 env，避免污染全局 process.env。 */
  subprocessEnv?: Record<string, string>;
}

/** 单次工具调用的上下文，比 ToolContext 多 toolUseId。 */
export interface ToolUseContext extends ToolContext {
  toolUseId: string;
}

export interface ToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string | any[];
  is_error?: boolean;
}

/** 结果进入模型上下文前的会话策略转换器。 */
export type ToolResultTransformer = (
  result: ToolResult,
  context: { toolName: string; profile?: string },
) => ToolResult;

/** validateInput 的返回；deny 时把 message 反馈给模型，不弹 UI。 */
export interface ValidationResult<Input = any> {
  behavior: "allow" | "deny";
  message?: string;
  updatedInput?: Input;
}

/** checkPermissions 的返回；工具级权限，补充宿主 canUseTool。 */
export interface PermissionResult<Input = any> {
  behavior: "allow" | "deny";
  message?: string;
  updatedInput?: Input;
}
