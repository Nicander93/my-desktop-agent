export { BinaryFileError, PathScopeError, ToolError } from "@/core/errors.js";
export type {
  PermissionDecision,
  PermissionEngine,
  PermissionKind,
  PermissionRequirement,
} from "@/core/permission.js";
export { DEFAULT_TOOL_LIMITS } from "@/core/tool-context.js";
export type {
  FilePolicy,
  ToolBinaries,
  ToolContext,
  ToolLimits,
} from "@/core/tool-context.js";
export { runTool } from "@/core/tool.js";
export type { Tool, ToolMetadata } from "@/core/tool.js";

export { editTool } from "@/tools/general/edit/edit-tool.js";
export type { EditInput, EditOutput } from "@/tools/general/edit/edit-tool.js";
export { globTool } from "@/tools/general/glob/glob-tool.js";
export type { GlobInput, GlobOutput } from "@/tools/general/glob/glob-tool.js";
export { grepTool } from "@/tools/general/grep/grep-tool.js";
export type {
  GrepContentMatch,
  GrepContextLine,
  GrepInput,
  GrepOutput,
} from "@/tools/general/grep/grep-tool.js";
export { readTool } from "@/tools/general/read/read-tool.js";
export type { ReadInput, ReadOutput } from "@/tools/general/read/read-tool.js";
export { writeTool } from "@/tools/general/write/write-tool.js";
export type {
  WriteInput,
  WriteOutput,
} from "@/tools/general/write/write-tool.js";

export { createToolRegistry, generalTools } from "@/registry/general-tools.js";
export type { AnyTool } from "@/registry/general-tools.js";

export { runAgentLoop } from "@/agent/agent-loop.js";
export type {
  AgentLoopInput,
  AgentLoopResult,
  AgentStopReason,
} from "@/agent/types.js";
export type { Model } from "@/model/model.js";
export type { ModelInput, ModelResponse } from "@/model/model.js";
export type {
  AssistantContent,
  AssistantMessage,
  Message,
  ToolCall,
  ToolDefinition,
  ToolMessage,
  UserMessage,
} from "@/model/types.js";
export {
  createToolExecutor,
  DefaultToolExecutor,
} from "@/tools/tool-executor.js";
export type {
  ToolExecutor,
  ToolExecutorOptions,
} from "@/tools/tool-executor.js";
