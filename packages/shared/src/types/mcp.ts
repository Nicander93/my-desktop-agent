/**
 * MCP 类型，以及 AgentRuntimeProfile / AgentSendMessageOptions。
 * 后两个历史原因放这文件，IPC 和 renderer 都从这里 import。
 * 引擎 trace 在 open-agent-sdk；UI 扩展在 types/trace.ts。
 */
import type { AgentMessageAttachmentRef } from "./attachment.js";

/**
 * MCP Server 的连接协议。
 *
 * 该值决定 Host 如何启动或连接服务，不能仅按 URL 是否存在推断。
 */
export type McpTransport = "stdio" | "sse" | "http";

/**
 * MCP Server 配置的创建来源。
 *
 * catalog 配置仍可被用户修改，但保留来源以便 UI 提供合适的更新和展示逻辑。
 */
export type McpServerSource = "catalog" | "custom";

/**
 * MCP 目录条目的展示分类，不参与权限判定或工具策略解析。
 */
export type McpCatalogCategory =
  | "files"
  | "office"
  | "web"
  | "dev"
  | "database"
  | "other";

/**
 * 持久化的 MCP Server 配置。
 *
 * `command` 与 `url` 的有效性由 `transport` 决定；调用方不能假设两者同时存在。
 */
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

/**
 * 内置 MCP 目录中的可安装模板。
 *
 * 模板仅提供初始连接参数，运行时凭证仍由用户填写的环境变量提供。
 */
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

/**
 * 创建或更新 MCP Server 时可提交的字段。
 *
 * 缺省字段由服务层补齐，不能直接当作完整的持久化记录使用。
 */
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

/**
 * 从兼容 MCP 配置文件读取的顶层结构。
 *
 * 导入器只消费 `mcpServers`，其余字段必须被忽略以避免把无关配置写入本地库。
 */
export interface McpImportFile {
  mcpServers?: Record<string, McpImportServerConfig>;
}

/**
 * 外部 MCP 配置中单个服务的宽松表示。
 *
 * 它允许 headers 等当前运行时未使用的字段，以便导入时给出兼容处理而非解析失败。
 */
export interface McpImportServerConfig {
  type?: "stdio" | "sse" | "http";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

/**
 * 暴露给 UI 的 MCP 工具摘要。
 *
 * 不携带可执行实现或权限信息，避免 renderer 误将其当作运行时契约。
 */
export interface McpToolInfo {
  name: string;
  description: string;
}

/**
 * 支持的 Runtime Profile 名称及其稳定排序。
 *
 * 分类和策略解析共同以此为单一来源；新增值时必须同步检查共享 IPC 契约和 Runtime 策略表。
 */
export const AGENT_RUNTIME_PROFILES = [
  "general",
  "office",
  "office-pptx",
  "coding",
  "file-organizing",
  "mcp",
] as const;

/**
 * Runtime Profile 的共享枚举类型。
 *
 * IPC 传输此类型；最终执行策略仍由 agent-runtime 解析，renderer 不应自行推导工具权限。
 */
export type AgentRuntimeProfile = (typeof AGENT_RUNTIME_PROFILES)[number];

/**
 * 判断 IPC 传入字符串是否是受支持的 Runtime Profile。
 *
 * 运行时校验必须基于共享常量，避免 renderer、Host 和 Runtime 的可选值漂移。
 */
export function isAgentRuntimeProfile(
  value: string,
): value is AgentRuntimeProfile {
  return (AGENT_RUNTIME_PROFILES as readonly string[]).includes(value);
}

/**
 * renderer 发送消息到 Host 时附带的可选上下文。
 *
 * 未指定 `profile` 时 Host 会使用模型分类；附件只引用持久化记录，不携带二进制内容。
 */
export interface AgentSendMessageOptions {
  mcpMentions?: string[];
  fileRefs?: string[];
  skillMentions?: string[];
  profile?: AgentRuntimeProfile;
  attachments?: AgentMessageAttachmentRef[];
  /** 把附件挂到这条用户消息上 */
  messageId?: string;
}
