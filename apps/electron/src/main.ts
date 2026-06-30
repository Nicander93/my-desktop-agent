/**
 * Electron 主进程入口
 *
 * 职责：
 * - 初始化 SQLite、AgentRuntime、BrowserWindow
 * - 注册 workspace / conversation / dialog IPC
 * - 桥接 Agent 与对话（conversationId = sessionId）
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { AgentRuntime, RuntimeOptions } from '@desktop-agent/agent-runtime';
import type { AgentSendMessageOptions } from '@desktop-agent/shared';
import { join } from 'path';
import { loadProjectEnv } from './loadEnvFile';
import { getDatabaseAsync, closeDatabase } from './db';
import { registerWorkspaceHandlers } from './ipc/workspaceHandlers';
import { registerConversationHandlers } from './ipc/conversationHandlers';
import { registerDialogHandlers } from './ipc/dialogHandlers';
import { registerFileHandlers } from './ipc/fileHandlers';
import { registerMcpHandlers, getEnabledMcpServersForWorkspace } from './ipc/mcpHandlers';
<<<<<<< HEAD
import { registerSkillHandlers } from './ipc/skillHandlers';
import { getRuntimeSkillDefinitions } from './services/skillService';
=======
import { registerSkillHandlers, getEnabledSkillsPrompt, getSkillMentionPrompt, getEnabledSkillNames } from './ipc/skillHandlers';
>>>>>>> e2ca66262520acbed1d525d6937a13d2d943b570
import { parseSkillMentions } from '@desktop-agent/shared';
import * as conversationService from './services/conversationService';
import * as workspaceService from './services/workspaceService';
import { setupPathInterceptor } from './services/agentPathInterceptor';

loadProjectEnv();

/** 全局 Agent 运行时实例，按 sessionId 管理多个 Agent */
let runtime: AgentRuntime;
/** 主窗口引用，用于流式推送和路径访问弹窗 */
let mainWindow: BrowserWindow | null = null;

/** 读取环境变量，兼容 electron-vite 的 MAIN_VITE_ 前缀 */
function readEnv(name: string): string | undefined {
  return process.env[name] || process.env[`MAIN_VITE_${name}`];
}

function parseThinkingConfig(): RuntimeOptions['thinking'] {
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

/**
 * 创建 AgentRuntime 并注入路径拦截器
 * permissionMode 设为 default，工具执行前会走路径检查
 */
function createRuntime(): void {
  const apiKey = readEnv('CODEANY_API_KEY');
  const model = readEnv('CODEANY_MODEL') || 'deepseek-v4-flash';
  const apiType = (readEnv('CODEANY_API_TYPE') as RuntimeOptions['apiType']) || 'openai-completions';
  const baseURL = readEnv('CODEANY_BASE_URL') || 'https://api.deepseek.com';
  const thinking = parseThinkingConfig();

  if (!apiKey) {
    console.warn('[desktop-agent] CODEANY_API_KEY 未设置，请在项目根目录 .env 中配置');
  } else {
    console.info(
      `[desktop-agent] Agent 已配置: model=${model}, baseURL=${baseURL}, thinking=${thinking?.type}`,
    );
  }

  const options: RuntimeOptions = {
    apiKey,
    model,
    apiType,
    baseURL,
    maxTurns: 10,
    permissionMode: 'default',
    thinking,
  };

  runtime = new AgentRuntime(options);
  // 延迟获取 mainWindow，避免创建顺序问题
  setupPathInterceptor(runtime, () => mainWindow);
}

/** 创建主窗口，开发模式加载 Vite dev server */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const isDev = process.env.NODE_ENV === 'development' || !!process.env.ELECTRON_RENDERER_URL;
  if (isDev) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL || 'http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * 根据对话 ID 解析 Agent 执行上下文
 * conversationId 与 Agent sessionId 一一对应
 */
function resolveWorkspaceContext(conversationId: string): { cwd: string; workspaceId: string } | undefined {
  const conversation = conversationService.getConversation(conversationId);
  if (!conversation) return undefined;
  const workspace = workspaceService.getWorkspace(conversation.workspaceId);
  if (!workspace) return undefined;
  return { cwd: workspace.path, workspaceId: workspace.id };
}

/**
 * 从 SDK 流式消息中提取用户可读的错误信息
 * 无 assistant 消息时视为失败
 */
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

app.whenReady().then(async () => {
  await getDatabaseAsync();
  createRuntime();
  createWindow();
  registerWorkspaceHandlers();
  registerConversationHandlers();
  registerDialogHandlers();
  registerFileHandlers(() => mainWindow);
  registerMcpHandlers();
  registerSkillHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  await runtime?.closeAll();
  closeDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function buildAgentSessionOptions(conversationId: string) {
  const context = resolveWorkspaceContext(conversationId);
  if (!context) return undefined;
  return {
    cwd: context.cwd,
    workspaceId: context.workspaceId,
    mcpServers: getEnabledMcpServersForWorkspace(context.cwd),
<<<<<<< HEAD
    skills: getRuntimeSkillDefinitions(),
=======
    enabledSkillsPrompt: getEnabledSkillsPrompt(),
>>>>>>> e2ca66262520acbed1d525d6937a13d2d943b570
  };
}

function buildAgentQueryOptions(content: string, options?: AgentSendMessageOptions) {
<<<<<<< HEAD
  return {
    mcpMentions: options?.mcpMentions,
    fileRefs: options?.fileRefs,
    skillMentions: options?.skillMentions ?? parseSkillMentions(content),
=======
  const skillMentions = options?.skillMentions ?? parseSkillMentions(content);
  const enabledNames = new Set(getEnabledSkillNames());
  const extraSkillMentions = skillMentions.filter((name) => !enabledNames.has(name));
  return {
    mcpMentions: options?.mcpMentions,
    fileRefs: options?.fileRefs,
    skillMentionPrompt: extraSkillMentions.length > 0
      ? getSkillMentionPrompt(extraSkillMentions)
      : undefined,
>>>>>>> e2ca66262520acbed1d525d6937a13d2d943b570
  };
}

/** 预创建 Agent session，绑定工作区 cwd 和 workspaceId */
ipcMain.handle('agent:create-session', (_, sessionId: string) => {
  const sessionOptions = buildAgentSessionOptions(sessionId);
  if (!sessionOptions) {
    return { success: false, error: '找不到对话所属工作区' };
  }
  runtime.createAgent(sessionId, sessionOptions);
  return { success: true, sessionId };
});

/** 发送消息并流式推送 agent:stream-message 到渲染进程 */
ipcMain.handle('agent:send-message', async (_, sessionId: string, content: string, options?: AgentSendMessageOptions) => {
  try {
    const sessionOptions = buildAgentSessionOptions(sessionId);
    if (!sessionOptions) {
      return { success: false, error: '找不到对话所属工作区，请确认工作区存在' };
    }

    const stream = await runtime.sendMessage(sessionId, content, sessionOptions, buildAgentQueryOptions(content, options));
    const messages: any[] = [];

    for await (const msg of stream) {
      messages.push(msg);
      // 实时推送到渲染进程，供 useAgent 更新 UI
      mainWindow?.webContents.send('agent:stream-message', {
        sessionId,
        message: msg
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
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

/** 非流式单次 prompt，同样绑定工作区上下文 */
ipcMain.handle('agent:prompt', async (_, sessionId: string, content: string, options?: AgentSendMessageOptions) => {
  try {
    const sessionOptions = buildAgentSessionOptions(sessionId);
    if (!sessionOptions) {
      return { success: false, error: '找不到对话所属工作区，请确认工作区存在' };
    }

    const result = await runtime.prompt(sessionId, content, sessionOptions, buildAgentQueryOptions(content, options));
    return { success: true, content: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('agent:get-messages', (_, sessionId: string) => {
  const messages = runtime.getMessages(sessionId);
  return { success: true, messages };
});

ipcMain.handle('agent:get-trace-run', async (_, sessionId: string, runId: string) => {
  try {
    const traceRun = await runtime.getTraceRun(sessionId, runId);
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
    const traceRun = await runtime.getLatestTraceRun(sessionId);
    return { success: true, traceRun };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

ipcMain.handle('agent:close-session', async (_, sessionId: string) => {
  await runtime.close(sessionId);
  return { success: true };
});
