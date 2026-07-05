import { ipcMain } from 'electron';
import {
  parseMcpImportJson,
  type AgentSendMessageOptions,
  type McpServerInput,
} from '@desktop-agent/shared';
import { buildSessionMcpServers, setupMcpServer, testMcpConnection } from '@desktop-agent/agent-runtime';
import * as mcpService from '../services/mcpService';
import * as workspaceService from '../services/workspaceService';
import * as conversationService from '../services/conversationService';
import type { McpServerRecord } from '@desktop-agent/shared';
import { createBundledCommandResolver, buildSubprocessEnv } from '../runtime/policy';
import { getBinaryManagerPaths, isRuntimeReady, getRuntimeInitError } from '../runtime/manager';

function getRuntimeBlockedMessage(): string | undefined {
  if (process.platform === 'win32' && !isRuntimeReady()) {
    return getRuntimeInitError() ?? '运行时未就绪，请先运行 pnpm setup:binaries';
  }
  return undefined;
}

function buildSdkConfig(server: McpServerRecord, workspacePath?: string): Record<string, unknown> | undefined {
  const config = buildSessionMcpServers([server], workspacePath, {
    commandResolver: createBundledCommandResolver(getBinaryManagerPaths()),
  });
  const entry = config[server.name];
  if (!entry) return undefined;

  const subprocessEnv = buildSubprocessEnv('general', getBinaryManagerPaths());
  return {
    ...entry,
    env: {
      ...subprocessEnv,
      ...((entry.env as Record<string, string> | undefined) ?? {}),
    },
  };
}

function resolveWorkspacePath(conversationId?: string): string | undefined {
  if (!conversationId) return undefined;
  const conversation = conversationService.getConversation(conversationId);
  if (!conversation) return undefined;
  const workspace = workspaceService.getWorkspace(conversation.workspaceId);
  return workspace?.path;
}

async function prepareInstalledMcpServer(
  server: McpServerRecord,
  workspacePath?: string,
): Promise<{ success: boolean; tools: Array<{ name: string; description?: string }>; error?: string }> {
  const sdkConfig = buildSdkConfig(server, workspacePath);
  if (!sdkConfig) {
    return { success: false, tools: [], error: '无法构建 MCP 配置' };
  }
  return setupMcpServer(server.name, sdkConfig, {
    subprocessEnv: buildSubprocessEnv('general', getBinaryManagerPaths()),
  });
}

export function registerMcpHandlers(): void {
  ipcMain.handle('mcp:get-all', () => {
    try {
      return { success: true, servers: mcpService.getAllMcpServers() };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '加载失败' };
    }
  });

  ipcMain.handle('mcp:get-catalog', () => {
    try {
      return { success: true, catalog: mcpService.getCatalog() };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '加载失败' };
    }
  });

  ipcMain.handle('mcp:get-mentionable', () => {
    try {
      return { success: true, servers: mcpService.listMentionableServers() };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '加载失败' };
    }
  });

  ipcMain.handle('mcp:create', (_, input: McpServerInput) => {
    try {
      const server = mcpService.createMcpServer(input);
      return { success: true, server };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '创建失败' };
    }
  });

  ipcMain.handle('mcp:update', (_, id: string, updates: Partial<McpServerInput>) => {
    try {
      const server = mcpService.updateMcpServer(id, updates);
      if (!server) return { success: false, error: 'MCP 不存在' };
      return { success: true, server };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '更新失败' };
    }
  });

  ipcMain.handle('mcp:delete', (_, id: string) => {
    try {
      mcpService.deleteMcpServer(id);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '删除失败' };
    }
  });

  ipcMain.handle('mcp:install-catalog', async (_, catalogId: string, secrets?: Record<string, string>) => {
    const blocked = getRuntimeBlockedMessage();
    if (blocked) return { success: false, error: blocked };

    let server: McpServerRecord | undefined;
    try {
      server = mcpService.installFromCatalog(catalogId, secrets);
      const setup = await prepareInstalledMcpServer(server);
      if (!setup.success) {
        mcpService.deleteMcpServer(server.id);
        return { success: false, error: setup.error || '安装失败' };
      }
      return { success: true, server, tools: setup.tools };
    } catch (error) {
      if (server) mcpService.deleteMcpServer(server.id);
      return { success: false, error: error instanceof Error ? error.message : '安装失败' };
    }
  });

  ipcMain.handle('mcp:import-json', async (_, raw: string) => {
    const blocked = getRuntimeBlockedMessage();
    if (blocked) return { success: false, error: blocked };

    try {
      const entries = parseMcpImportJson(raw);
      const servers: McpServerRecord[] = [];
      const errors: string[] = [];

      for (const { name, config } of entries) {
        let server: McpServerRecord | undefined;
        try {
          server = mcpService.importMcpServer(name, config);
          const setup = await prepareInstalledMcpServer(server);
          if (!setup.success) {
            mcpService.deleteMcpServer(server.id);
            errors.push(`${name}: ${setup.error || '安装失败'}`);
            continue;
          }
          servers.push(server);
        } catch (error) {
          if (server) mcpService.deleteMcpServer(server.id);
          errors.push(`${name}: ${error instanceof Error ? error.message : '导入失败'}`);
        }
      }

      if (servers.length === 0) {
        return { success: false, error: errors.join('；') || '导入失败' };
      }

      return {
        success: true,
        servers,
        warning: errors.length > 0 ? errors.join('；') : undefined,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '导入失败' };
    }
  });

  ipcMain.handle('mcp:test-connection', async (_, id: string, conversationId?: string) => {
    try {
      const blocked = getRuntimeBlockedMessage();
      if (blocked) return { success: false, error: blocked, tools: [] };

      const server = mcpService.getMcpServer(id);
      if (!server) return { success: false, error: 'MCP 不存在' };

      const workspacePath = resolveWorkspacePath(conversationId);
      const sdkConfig = buildSdkConfig(server, workspacePath);
      if (!sdkConfig) {
        return { success: false, error: '无法构建 MCP 配置' };
      }

      return testMcpConnection(server.name, sdkConfig, {
        subprocessEnv: buildSubprocessEnv('general', getBinaryManagerPaths()),
      });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '测试失败', tools: [] };
    }
  });
}

export function getEnabledMcpServersForWorkspace(workspacePath?: string): Record<string, unknown> {
  return buildSessionMcpServers(mcpService.getEnabledMcpServers(), workspacePath, {
    commandResolver: createBundledCommandResolver(getBinaryManagerPaths()),
  });
}

export type { AgentSendMessageOptions };
