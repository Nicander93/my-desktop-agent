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
export type { Tool, ToolDefinition } from "@/core/tool.js";

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
export type { Model, StreamingModel } from "@/model/model.js";
export type {
  ModelInput,
  ModelResponse,
  ModelStreamEvent,
  ModelUsage,
} from "@/model/model.js";
export {
  OpenAICompatibleError,
  OpenAICompatibleModel,
} from "@/model/openai-compatible-model.js";
export type { OpenAICompatibleModelOptions } from "@/model/openai-compatible-model.js";
export type {
  AssistantContent,
  AssistantMessage,
  Message,
  ToolCall,
  ToolMessage,
  UserContent,
  UserMessage,
} from "@/core/message.js";
export {
  createToolExecutor,
  DefaultToolExecutor,
} from "@/tools/tool-executor.js";
export type {
  ToolExecutor,
  ToolExecutorOptions,
} from "@/tools/tool-executor.js";

// Keep scaffold modules internal until each contract is designed and promoted deliberately.
export {} from "@/core/agent-loop.js";
export {} from "@/core/agent.js";
export {} from "@/core/context.js";
export {} from "@/core/event.js";
export {} from "@/core/state.js";
export {} from "@/services/compaction/compaction-service.js";
export {} from "@/services/context/context-manager.js";
export {} from "@/services/execution/execution-environment.js";
export {} from "@/services/permission/permission-engine.js";
export {} from "@/services/persistence/persistence.js";
export {} from "@/services/queue/execution-queue.js";
export {} from "@/services/session/session.js";
export {} from "@/services/tool/executor.js";
export {} from "@/services/tool/registry.js";
export {} from "@/tools/agent/subagent-tool.js";
export {} from "@/tools/filesystem/edit-tool.js";
export {} from "@/tools/filesystem/read-tool.js";
export {} from "@/tools/filesystem/write-tool.js";
export {} from "@/tools/search/glob-tool.js";
export {} from "@/tools/search/grep-tool.js";
export {} from "@/tools/shell/bash-tool.js";
