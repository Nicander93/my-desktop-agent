/** 契约层 re-export：类型、Skill/MCP/trace 工具（Node 专用见 ./env、./runtime） */
export type { MessagePart } from './types/message.js';
export type { Workspace, WorkspaceSettings } from './types/workspace.js';
export type { Conversation, Message as ConversationMessage } from './types/conversation.js';
export type { ModelConfig, ModelConfigInput, ModelConnectionTestResult } from './types/model.js';
export type {
  EvaluationArtifacts,
  EvaluationCheck,
  EvaluationCommand,
  EvaluationLimits,
  EvaluationResult,
  EvaluationTask,
  EvaluationVerification,
  EvaluationVerifier,
} from './types/evaluation.js';
export type {
  AgentMessageAttachmentRef,
  AttachmentDraft,
  CreateAttachmentFromBytesInput,
  ImageAttachment,
  ImageAttachmentStatus,
  ImageAttachmentVariant,
} from './types/attachment.js';
export type { FileEntry, FileStat, ReadFileResult, FileSearchResult } from './types/filesystem.js';
export type {
  McpTransport,
  McpServerSource,
  McpCatalogCategory,
  McpServerRecord,
  McpCatalogEntry,
  McpServerInput,
  McpImportFile,
  McpImportServerConfig,
  McpToolInfo,
  AgentRuntimeProfile,
  AgentSendMessageOptions,
} from './types/mcp.js';
export { AGENT_RUNTIME_PROFILES, isAgentRuntimeProfile } from './types/mcp.js';
export { MCP_CATALOG, getCatalogEntry } from './mcp/catalog.js';
export {
  buildMcpServersForSdk,
  parseCommandLine,
  parseMcpImportJson,
  importConfigToServerInput,
  type McpBuildContext,
  type McpCommandResolver,
} from './mcp/buildConfig.js';
export { parseMcpMentions, buildMcpMentionPrompt } from './mcp/mentions.js';
export { parseFileMentions, buildFileMentionPrompt } from './files/mentions.js';
export type {
  SkillSource,
  SkillCatalogCategory,
  SkillRecord,
  SkillCatalogEntry,
  SkillInput,
  ParsedSkillMarkdown,
  RuntimeSkillDefinition,
} from './types/skill.js';
export { SKILL_CATALOG, getSkillCatalogEntry, OFFICECLI_PPTX_AGENT_SKILL } from './skills/catalog.js';
export {
  parseSkillMarkdown,
  getSkillPromptBody,
  buildEnabledSkillsPrompt,
  buildSkillMentionPrompt,
  buildSkillMentionHint,
  type SkillPromptSection,
} from './skills/resolve.js';
export { parseSkillMentions } from './skills/mentions.js';
export type {
  TraceSpan,
  TraceSpanType,
  TraceTurn,
  TraceRun,
  AgentTrace,
  TraceSummary,
  LlmRequestPayload,
  LlmResponsePayload,
  ToolCallPayload,
  ToolResultPayload,
  RunStartPayload,
  RunEndPayload,
} from './types/trace.js';
export {
  groupTraceByRun,
  groupTraceByTurn,
  buildTraceRunFromSpans,
  summarizeTraceRun,
  appendTraceSpan,
  isTraceMessage,
  collectTraceFromMessages,
  mergeAgentTrace,
  traceRunToAgentTrace,
} from './trace/groupTrace.js';
export type {
  Tool,
  ToolResult,
  Session,
  RuntimeMessage as Message,
  Artifact,
  ToolCall,
} from './types/runtime.js';
