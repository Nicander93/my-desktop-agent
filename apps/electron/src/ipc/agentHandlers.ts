/**
 * Agent 相关 IPC Handler
 */
import { ipcMain, BrowserWindow } from 'electron';
import {
  AgentRuntime,
  inferRuntimeProfile,
  type RuntimeOptions,
} from '@desktop-agent/agent-runtime';
import type { AgentSendMessageOptions } from '@desktop-agent/shared';
import { parseSkillMentions } from '@desktop-agent/shared';
import * as conversationService from '../services/conversationService';
import * as workspaceService from '../services/workspaceService';
import { getEnabledMcpServersForWorkspace } from './mcpHandlers';
import { getRuntimeSkillDefinitions } from './skillHandlers';
import { BinaryManager, isRuntimeReady, getRuntimeInitError } from '../runtime/manager';
import { buildSubprocessEnv, mergeRuntimeEnvIntoMcpServers } from '../runtime/policy';
import {
  getAttachmentsForMessage,
  linkAttachments,
  readAttachmentBase64,
} from '../services/attachmentService';

function readEnv(name: string): string | undefined {
  return process.env[name] || process.env[`MAIN_VITE_${name}`];
}

function resolveWorkspaceContext(conversationId: string): { cwd: string; workspaceId: string } | undefined {
  const conversation = conversationService.getConversation(conversationId);
  if (!conversation) return undefined;
  const workspace = workspaceService.getWorkspace(conversation.workspaceId);
  if (!workspace) return undefined;
  return { cwd: workspace.path, workspaceId: workspace.id };
}

function getAgentErrorFromMessages(messages: any[]): string | undefined {
  const hasAssistant = messages.some((msg) => msg?.type === 'assistant');
  if (hasAssistant) return undefined;

  const result = messages.find((msg) => msg?.type === 'result');
  if (!result) return undefined;

  if (Array.isArray(result.errors) && result.errors.length > 0) {
    return result.errors.join('；');
  }

  if (!readEnv('CODEANY_API_KEY')) {
    return '未读取到 CODEANY_API_KEY，请确认项目根目录 .env 存在并已重启 pnpm dev';
  }

  if (result.subtype === 'error') {
    return 'DeepSeek API 请求失败，请检查模型名称（如 deepseek-v4-flash）、API Key 和 Base URL（https://api.deepseek.com）';
  }

  return `Agent 请求失败（${result.subtype || 'unknown'}）`;
}

function getRuntimeBlockedMessage(): string | undefined {
  if (process.platform === 'win32' && !isRuntimeReady()) {
    return getRuntimeInitError() ?? '运行时未就绪，请先运行 pnpm setup:binaries';
  }
  return undefined;
}

function buildPromptContent(sessionId: string, content: string, options?: AgentSendMessageOptions): string | any[] {
  const refs = options?.attachments ?? [];
  if (refs.length === 0) return content;

  const attachments = getAttachmentsForMessage(refs, sessionId);
  if (options?.messageId) {
    linkAttachments(refs, sessionId, options.messageId);
  }

  const blocks: any[] = [{
    type: 'text',
    text: content.trim() || '请识别这张图片',
  }];

  for (const attachment of attachments) {
    blocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: attachment.mimeType,
        data: readAttachmentBase64(attachment),
      },
    });
  }

  return blocks;
}

export function registerAgentHandlers(
  getRuntime: () => AgentRuntime,
  getMainWindow: () => BrowserWindow | null,
  getBinaryManager: () => BinaryManager,
): void {
  function buildAgentSessionOptions(conversationId: string) {
    const context = resolveWorkspaceContext(conversationId);
    if (!context) return undefined;

    const binaryManager = getBinaryManager();
    const subprocessEnv = buildSubprocessEnv('general', binaryManager.getPaths());
    const mcpServers = mergeRuntimeEnvIntoMcpServers(
      getEnabledMcpServersForWorkspace(context.cwd),
      subprocessEnv,
    );

    return {
      cwd: context.cwd,
      workspaceId: context.workspaceId,
      mcpServers,
      skills: getRuntimeSkillDefinitions(),
      subprocessEnv,
    };
  }

  function buildAgentQueryOptions(content: string, options?: AgentSendMessageOptions) {
    const profile = inferRuntimeProfile(content, options?.profile);
    return {
      mcpMentions: options?.mcpMentions,
      fileRefs: options?.fileRefs,
      skillMentions: options?.skillMentions ?? parseSkillMentions(content),
      profile,
      subprocessEnv: buildSubprocessEnv(profile, getBinaryManager().getPaths()),
    };
  }

  ipcMain.handle('agent:create-session', (_, sessionId: string) => {
    const blocked = getRuntimeBlockedMessage();
    if (blocked) return { success: false, error: blocked };

    const sessionOptions = buildAgentSessionOptions(sessionId);
    if (!sessionOptions) {
      return { success: false, error: '找不到对话所属工作区' };
    }
    getRuntime().createAgent(sessionId, sessionOptions);
    return { success: true, sessionId };
  });

  ipcMain.handle(
    'agent:send-message',
    async (_, sessionId: string, content: string, options?: AgentSendMessageOptions) => {
      try {
        const blocked = getRuntimeBlockedMessage();
        if (blocked) return { success: false, error: blocked };

        const sessionOptions = buildAgentSessionOptions(sessionId);
        if (!sessionOptions) {
          return { success: false, error: '找不到对话所属工作区，请确认工作区存在' };
        }

        const runtime = getRuntime();
        const promptContent = buildPromptContent(sessionId, content, options);
        const stream = await runtime.sendMessage(
          sessionId,
          promptContent,
          sessionOptions,
          buildAgentQueryOptions(content, options),
        );
        const messages: any[] = [];

        for await (const msg of stream) {
          messages.push(msg);
          getMainWindow()?.webContents.send('agent:stream-message', {
            sessionId,
            message: msg,
          });
        }

        const agentError = getAgentErrorFromMessages(messages);
        if (agentError) {
          return { success: false, error: agentError, messages };
        }

        return { success: true, messages };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  );

  ipcMain.handle(
    'agent:prompt',
    async (_, sessionId: string, content: string, options?: AgentSendMessageOptions) => {
      try {
        const blocked = getRuntimeBlockedMessage();
        if (blocked) return { success: false, error: blocked };

        const sessionOptions = buildAgentSessionOptions(sessionId);
        if (!sessionOptions) {
          return { success: false, error: '找不到对话所属工作区，请确认工作区存在' };
        }

        const result = await getRuntime().prompt(
          sessionId,
          content,
          sessionOptions,
          buildAgentQueryOptions(content, options),
        );
        return { success: true, content: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  );

  ipcMain.handle('agent:get-messages', (_, sessionId: string) => {
    const messages = getRuntime().getMessages(sessionId);
    return { success: true, messages };
  });

  ipcMain.handle('agent:get-trace-run', async (_, sessionId: string, runId: string) => {
    try {
      const traceRun = await getRuntime().getTraceRun(sessionId, runId);
      return { success: true, traceRun };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  ipcMain.handle('agent:get-latest-trace-run', async (_, sessionId: string) => {
    try {
      const traceRun = await getRuntime().getLatestTraceRun(sessionId);
      return { success: true, traceRun };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  ipcMain.handle('agent:close-session', async (_, sessionId: string) => {
    await getRuntime().close(sessionId);
    return { success: true };
  });
}

export function parseThinkingConfig(): RuntimeOptions['thinking'] {
  const mode = (readEnv('CODEANY_THINKING') || 'enabled').toLowerCase();
  if (mode === 'disabled' || mode === 'off' || mode === 'false') {
    return { type: 'disabled' };
  }

  const budgetRaw = readEnv('CODEANY_THINKING_BUDGET');
  const budgetTokens = budgetRaw ? Number(budgetRaw) : 8000;

  if (mode === 'adaptive') {
    return Number.isFinite(budgetTokens) ? { type: 'adaptive', budgetTokens } : { type: 'adaptive' };
  }

  return {
    type: 'enabled',
    budgetTokens: Number.isFinite(budgetTokens) ? budgetTokens : 8000,
  };
}

export function readAgentEnv(name: string): string | undefined {
  return readEnv(name);
}
