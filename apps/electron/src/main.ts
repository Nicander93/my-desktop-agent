import { app, BrowserWindow, ipcMain } from 'electron';
import { AgentRuntime, RuntimeOptions } from '@desktop-agent/agent-runtime';
import { join } from 'path';
import { loadProjectEnv } from './loadEnvFile';

loadProjectEnv();

let runtime: AgentRuntime;
let mainWindow: BrowserWindow | null = null;

function readEnv(name: string): string | undefined {
  return process.env[name] || process.env[`MAIN_VITE_${name}`];
}

function createRuntime(): void {
  const apiKey = readEnv('CODEANY_API_KEY');
  const model = readEnv('CODEANY_MODEL') || 'deepseek-v4-flash';
  const apiType = (readEnv('CODEANY_API_TYPE') as RuntimeOptions['apiType']) || 'openai-completions';
  const baseURL = readEnv('CODEANY_BASE_URL') || 'https://api.deepseek.com';

  if (!apiKey) {
    console.warn('[desktop-agent] CODEANY_API_KEY 未设置，请在项目根目录 .env 中配置');
  } else {
    console.info(`[desktop-agent] Agent 已配置: model=${model}, baseURL=${baseURL}`);
  }

  const options: RuntimeOptions = {
    apiKey,
    model,
    apiType,
    baseURL,
    cwd: join(__dirname, '../../..'),
    maxTurns: 10,
    permissionMode: 'bypassPermissions'
  };

  runtime = new AgentRuntime(options);
}

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

app.whenReady().then(() => {
  createRuntime();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  await runtime?.closeAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('agent:create-session', (_, sessionId: string) => {
  runtime.createAgent(sessionId);
  return { success: true, sessionId };
});

ipcMain.handle('agent:send-message', async (_, sessionId: string, content: string) => {
  try {
    const stream = await runtime.sendMessage(sessionId, content);
    const messages: any[] = [];

    for await (const msg of stream) {
      messages.push(msg);
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

ipcMain.handle('agent:prompt', async (_, sessionId: string, content: string) => {
  try {
    const result = await runtime.prompt(sessionId, content);
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

ipcMain.handle('agent:close-session', async (_, sessionId: string) => {
  await runtime.close(sessionId);
  return { success: true };
});
