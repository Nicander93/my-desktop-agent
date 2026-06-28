import { create } from 'zustand';
import type { McpCatalogEntry, McpServerRecord } from '@desktop-agent/shared';

type CatalogEntry = McpCatalogEntry & { installed: boolean };

interface McpStore {
  servers: McpServerRecord[];
  catalog: CatalogEntry[];
  mentionable: Array<{ name: string; displayName: string }>;
  loading: boolean;
  loadAll: () => Promise<void>;
  loadMentionable: () => Promise<void>;
  installCatalog: (catalogId: string, secrets?: Record<string, string>) => Promise<{ error?: string; toolCount?: number }>;
  updateServer: (id: string, updates: Partial<McpServerRecord>) => Promise<string | null>;
  deleteServer: (id: string) => Promise<string | null>;
  importJson: (raw: string) => Promise<{ error?: string; warning?: string; count?: number }>;
  testConnection: (id: string, conversationId?: string) => Promise<{ success: boolean; tools?: Array<{ name: string; description: string }>; error?: string }>;
}

export const useMcpStore = create<McpStore>((set, get) => ({
  servers: [],
  catalog: [],
  mentionable: [],
  loading: false,

  loadAll: async () => {
    if (!window.electronAPI?.mcp) return;
    set({ loading: true });
    try {
      const [allResult, catalogResult] = await Promise.all([
        window.electronAPI.mcp.getAll(),
        window.electronAPI.mcp.getCatalog(),
      ]);
      set({
        servers: allResult.success ? allResult.servers ?? [] : [],
        catalog: catalogResult.success ? catalogResult.catalog ?? [] : [],
      });
      await get().loadMentionable();
    } finally {
      set({ loading: false });
    }
  },

  loadMentionable: async () => {
    if (!window.electronAPI?.mcp) return;
    const result = await window.electronAPI.mcp.getMentionable();
    if (result.success) {
      set({ mentionable: result.servers ?? [] });
    }
  },

  installCatalog: async (catalogId, secrets) => {
    if (!window.electronAPI?.mcp) return { error: 'MCP API 不可用' };
    const result = await window.electronAPI.mcp.installCatalog(catalogId, secrets);
    if (!result.success) return { error: result.error || '安装失败' };
    await get().loadAll();
    return { toolCount: result.tools?.length };
  },

  updateServer: async (id, updates) => {
    if (!window.electronAPI?.mcp) return 'MCP API 不可用';
    const result = await window.electronAPI.mcp.update(id, {
      name: updates.name,
      displayName: updates.displayName,
      description: updates.description,
      transport: updates.transport,
      command: updates.command,
      args: updates.args,
      url: updates.url,
      env: updates.env,
      enabled: updates.enabled,
    });
    if (!result.success) return result.error || '更新失败';
    await get().loadAll();
    return null;
  },

  deleteServer: async (id) => {
    if (!window.electronAPI?.mcp) return 'MCP API 不可用';
    const result = await window.electronAPI.mcp.delete(id);
    if (!result.success) return result.error || '删除失败';
    await get().loadAll();
    return null;
  },

  importJson: async (raw) => {
    if (!window.electronAPI?.mcp) return { error: 'MCP API 不可用' };
    const result = await window.electronAPI.mcp.importJson(raw);
    if (!result.success) return { error: result.error || '导入失败' };
    await get().loadAll();
    return { warning: result.warning, count: result.servers?.length };
  },

  testConnection: async (id, conversationId) => {
    if (!window.electronAPI?.mcp) {
      return { success: false, error: 'MCP API 不可用' };
    }
    return window.electronAPI.mcp.testConnection(id, conversationId);
  },
}));
