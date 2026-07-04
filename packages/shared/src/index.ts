// 共享类型定义
export type { MessagePart } from './types/message.js';
export type { Workspace, WorkspaceSettings } from './types/workspace.js';
export type { Conversation, Message as ConversationMessage } from './types/conversation.js';
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
export { MCP_CATALOG, getCatalogEntry } from './mcp/catalog.js';
export {
  buildMcpServersForSdk,
  parseCommandLine,
  parseMcpImportJson,
  importConfigToServerInput,
  type McpBuildContext,
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
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(input: unknown): Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface Session {
  id: string;
  messages: Message[];
  artifacts: Artifact[];
  toolCalls: ToolCall[];
  files: string[];
  context: Record<string, unknown>;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Artifact {
  id: string;
  type: 'markdown' | 'code' | 'docx' | 'pptx' | 'xlsx' | 'image' | 'json';
  name: string;
  path: string;
  createdAt: number;
}

export interface ToolCall {
  id: string;
  toolName: string;
  input: unknown;
  output?: ToolResult;
  timestamp: number;
}
