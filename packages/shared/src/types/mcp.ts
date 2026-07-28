/**
 * MCP 类型，以及 AgentRuntimeProfile / AgentSendMessageOptions。
 * 后两个历史原因放这文件，IPC 和 renderer 都从这里 import。
 * 引擎 trace 在 open-agent-sdk；UI 扩展在 types/trace.ts。
 */
import type { AgentMessageAttachmentRef } from './attachment.js';

export type McpTransport = 'stdio' | 'sse' | 'http';
export type McpServerSource = 'catalog' | 'custom';
export type McpCatalogCategory = 'files' | 'office' | 'web' | 'dev' | 'database' | 'other';

export interface McpServerRecord {
  id: string;
  name: string;
  displayName: string;
  description: string;
  source: McpServerSource;
  catalogId: string | null;
  transport: McpTransport;
  command: string | null;
  args: string[];
  url: string | null;
  env: Record<string, string>;
  enabled: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface McpCatalogEntry {
  id: string;
  displayName: string;
  description: string;
  category: McpCatalogCategory;
  transport: McpTransport;
  template: {
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
  };
  requiredEnv?: Array<{ key: string; label: string }>;
}

export interface McpServerInput {
  name: string;
  displayName?: string;
  description?: string;
  source?: McpServerSource;
  catalogId?: string | null;
  transport: McpTransport;
  command?: string | null;
  args?: string[];
  url?: string | null;
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface McpImportFile {
  mcpServers?: Record<string, McpImportServerConfig>;
}

export interface McpImportServerConfig {
  type?: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface McpToolInfo {
  name: string;
  description: string;
}

/** 影响工具策略、subprocess env、office 提示等；单一来源，分类/policy 共用 */
export const AGENT_RUNTIME_PROFILES = [
  'general',
  'office',
  'office-pptx',
  'coding',
  'file-organizing',
  'mcp',
] as const;

export type AgentRuntimeProfile = (typeof AGENT_RUNTIME_PROFILES)[number];

export function isAgentRuntimeProfile(value: string): value is AgentRuntimeProfile {
  return (AGENT_RUNTIME_PROFILES as readonly string[]).includes(value);
}

/** renderer → main 发消息可选参数；profile 空则 Host 用模型分类 */
export interface AgentSendMessageOptions {
  mcpMentions?: string[];
  fileRefs?: string[];
  skillMentions?: string[];
  profile?: AgentRuntimeProfile;
  attachments?: AgentMessageAttachmentRef[];
  /** 把附件挂到这条用户消息上 */
  messageId?: string;
}
