/**

 * Electron 主进程入口

 *

 * 职责：

 * - 初始化 SQLite、AgentRuntime、BrowserWindow

 * - 注册 IPC handlers

 * - 桥接 Agent 与对话（conversationId = sessionId）

 */

import { app, BrowserWindow } from 'electron';

import {

  registerWorkspacePreviewProtocol,

  registerWorkspacePreviewScheme,

} from './services/workspacePreviewProtocol';

import { AgentRuntime, RuntimeOptions } from '@desktop-agent/agent-runtime';

import { join } from 'path';

import { loadProjectEnv } from './loadEnvFile';

import { getDatabaseAsync, closeDatabase } from './db';

import { registerWorkspaceHandlers } from './ipc/workspaceHandlers';

import { registerConversationHandlers } from './ipc/conversationHandlers';

import { registerDialogHandlers } from './ipc/dialogHandlers';

import { registerFileHandlers } from './ipc/fileHandlers';

import { registerAttachmentHandlers } from './ipc/attachmentHandlers';

import { registerMcpHandlers } from './ipc/mcpHandlers';

import { registerSkillHandlers } from './ipc/skillHandlers';

import { registerAgentHandlers, parseThinkingConfig, readAgentEnv } from './ipc/agentHandlers';

import { setupPathInterceptor } from './services/agentPathInterceptor';

import { BinaryManager, setBinaryManager } from './runtime/manager';



loadProjectEnv();

registerWorkspacePreviewScheme();



/** 全局 Agent 运行时实例，按 sessionId 管理多个 Agent */

let runtime: AgentRuntime;

/** 主窗口引用，用于流式推送和路径访问弹窗 */

let mainWindow: BrowserWindow | null = null;

/** App 级运行时管理 */

let binaryManager: BinaryManager;



/**

 * 创建 AgentRuntime 并注入路径拦截器

 * permissionMode 设为 default，工具执行前会走路径检查

 */

function createRuntime(): void {

  const apiKey = readAgentEnv('CODEANY_API_KEY');

  const model = readAgentEnv('CODEANY_MODEL') || 'deepseek-v4-flash';

  const apiType = (readAgentEnv('CODEANY_API_TYPE') as RuntimeOptions['apiType']) || 'openai-completions';

  const baseURL = readAgentEnv('CODEANY_BASE_URL') || 'https://api.deepseek.com';

  const thinking = parseThinkingConfig();

  const maxTurnsRaw = readAgentEnv('CODEANY_MAX_TURNS');

  const maxTurns = maxTurnsRaw ? Number(maxTurnsRaw) : 50;

  const resolvedMaxTurns = Number.isFinite(maxTurns) && maxTurns > 0 ? maxTurns : 50;



  if (!apiKey) {

    console.warn('[desktop-agent] CODEANY_API_KEY 未设置，请在项目根目录 .env 中配置');

  } else {

    console.info(

      `[desktop-agent] Agent 已配置: model=${model}, baseURL=${baseURL}, thinking=${thinking?.type}, maxTurns=${resolvedMaxTurns}`,

    );

  }



  const options: RuntimeOptions = {

    apiKey,

    model,

    apiType,

    baseURL,

    maxTurns: resolvedMaxTurns,

    permissionMode: 'default',

    thinking,

  };



  runtime = new AgentRuntime(options);

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



  const rendererUrl = process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:3000';

  const isDev = process.env.NODE_ENV === 'development' || !!process.env.ELECTRON_RENDERER_URL;

  if (isDev) {

    mainWindow.loadURL(rendererUrl);

    mainWindow.webContents.openDevTools();

  } else {

    mainWindow.loadFile(join(__dirname, '../renderer/dist/index.html'));

  }



  mainWindow.on('closed', () => {

    mainWindow = null;

  });

}



app.whenReady().then(async () => {

  binaryManager = new BinaryManager();

  setBinaryManager(binaryManager);

  try {

    await binaryManager.ensureInstalled();

    binaryManager.applyBaseEnv();

  } catch (error) {

    console.error('[desktop-agent] 运行时初始化失败:', error instanceof Error ? error.message : error);

  }



  await getDatabaseAsync();

  createRuntime();

  registerWorkspacePreviewProtocol(() => mainWindow);

  createWindow();

  registerWorkspaceHandlers();

  registerConversationHandlers();

  registerDialogHandlers();

  registerFileHandlers(() => mainWindow);

  registerAttachmentHandlers(() => mainWindow);

  registerMcpHandlers();

  registerSkillHandlers();

  registerAgentHandlers(

    () => runtime,

    () => mainWindow,

    () => binaryManager,

  );



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

