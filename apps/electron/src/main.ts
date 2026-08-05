/**
 * Electron 主进程入口。
 * 起 SQLite、AgentRuntime、窗口，注册 IPC。
 * conversationId 就是 Agent sessionId。
 */
import { app, BrowserWindow } from 'electron';
import {
  registerWorkspacePreviewProtocol,
  registerWorkspacePreviewScheme,
} from './services/workspacePreviewProtocol';
import { AgentRuntime, RuntimeOptions } from '@desktop-agent/agent-runtime';
import { join } from 'path';
import { loadProjectEnv } from '@desktop-agent/shared/env';
import { getDatabaseAsync, closeDatabase } from './db';
import { registerWorkspaceHandlers } from './ipc/workspaceHandlers';
import { registerConversationHandlers } from './ipc/conversationHandlers';
import { registerDialogHandlers } from './ipc/dialogHandlers';
import { registerFileHandlers } from './ipc/fileHandlers';
import { registerAttachmentHandlers } from './ipc/attachmentHandlers';
import { registerMcpHandlers } from './ipc/mcpHandlers';
import { registerSkillHandlers } from './ipc/skillHandlers';
import { registerModelHandlers } from './ipc/modelHandlers';
import { registerAgentHandlers, parseThinkingConfig, readAgentEnv } from './ipc/agentHandlers';
import { setupPathInterceptor } from './services/agentPathInterceptor';
import { BinaryManager, setBinaryManager } from './runtime/manager';



loadProjectEnv();
registerWorkspacePreviewScheme();



/**
 * 全局 Agent Runtime，按 sessionId 管理多个会话 Agent。
 *
 * 仅在 app ready、数据库和 bundled runtime 初始化后创建；窗口关闭时必须通过 `closeAll` 释放资源。
 */
let runtime: AgentRuntime;
/**
 * 主窗口引用，用于流式事件推送和路径访问确认。
 *
 * 窗口关闭时置空，IPC/Runtime 回调必须容忍没有可用窗口的无头状态。
 */
let mainWindow: BrowserWindow | null = null;
/**
 * 管理 App 级 bundled 二进制及其基础环境。
 *
 * 其路径由 Profile 子进程环境读取，不应直接修改用户系统的全局环境配置。
 */
let binaryManager: BinaryManager;



/**
 * 从 Host 环境创建 AgentRuntime，并注入路径拦截器。
 *
 * 必须保持 `permissionMode: 'default'`，使工具调用经 pathGuard 授权；空 API Key 只记录警告，让 UI 仍能展示可恢复错误。
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



/**
 * 创建主窗口并根据打包状态加载 Vite 或构建产物。
 *
 * preload 与 contextIsolation 是 renderer 唯一获得 Host 能力的桥接边界，不能为方便调试启用 nodeIntegration。
 */
function createWindow(): void {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(__dirname, '../resources/icon.png');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: iconPath,
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
  registerModelHandlers();
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

