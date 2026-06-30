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

export interface AgentSendMessageOptions {
  mcpMentions?: string[];
  fileRefs?: string[];
  skillMentions?: string[];
}
