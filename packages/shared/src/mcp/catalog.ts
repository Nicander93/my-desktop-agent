import type { McpCatalogEntry } from '../types/mcp.js';

export const MCP_CATALOG: McpCatalogEntry[] = [
  {
    id: 'filesystem',
    displayName: 'Filesystem',
    description: '读写工作区内的文件与目录',
    category: 'files',
    transport: 'stdio',
    template: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '{workspace}'],
    },
  },
  {
    id: 'markitdown',
    displayName: 'MarkItDown',
    description: '将 docx/xlsx/pptx/pdf 等转为 Markdown 供分析',
    category: 'office',
    transport: 'stdio',
    template: {
      command: 'uvx',
      args: ['markitdown-mcp'],
    },
  },
  {
    id: 'fetch',
    displayName: 'Fetch',
    description: '抓取网页内容',
    category: 'web',
    transport: 'stdio',
    template: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch'],
    },
  },
  {
    id: 'memory',
    displayName: 'Memory',
    description: '跨对话持久化记忆',
    category: 'other',
    transport: 'stdio',
    template: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
  },
  {
    id: 'sqlite',
    displayName: 'SQLite',
    description: '查询本地 SQLite 数据库',
    category: 'database',
    transport: 'stdio',
    template: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', '{workspace}/.desktop-agent/sqlite.db'],
    },
  },
  {
    id: 'github',
    displayName: 'GitHub',
    description: '访问 GitHub 仓库、Issue、PR',
    category: 'dev',
    transport: 'stdio',
    template: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: '{GITHUB_TOKEN}' },
    },
    requiredEnv: [{ key: 'GITHUB_TOKEN', label: 'GitHub Personal Access Token' }],
  },
  {
    id: 'brave-search',
    displayName: 'Brave Search',
    description: '网页搜索',
    category: 'web',
    transport: 'stdio',
    template: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      env: { BRAVE_API_KEY: '{BRAVE_API_KEY}' },
    },
    requiredEnv: [{ key: 'BRAVE_API_KEY', label: 'Brave Search API Key' }],
  },
  {
    id: 'excel',
    displayName: 'Excel MCP',
    description: '创建、读写、格式化 Excel（无需安装 Office）',
    category: 'office',
    transport: 'stdio',
    template: {
      command: 'uvx',
      args: ['excel-mcp-server', 'stdio'],
    },
  },
];

export function getCatalogEntry(id: string): McpCatalogEntry | undefined {
  return MCP_CATALOG.find((entry) => entry.id === id);
}
