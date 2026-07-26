#!/usr/bin/env node
/** 扫描 Vite 端口后启动 Electron dev，注入 ELECTRON_RENDERER_URL */
import { spawn } from 'node:child_process';

const DEFAULT_PORT = 3000;
const MAX_PORT = 3010;

/** 探测 /@vite/client 判断是否为 Vite 服务 */
async function isViteServer(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/@vite/client`);
    return response.ok;
  } catch {
    return false;
  }
}

/** 在端口范围内轮询直到发现 renderer */
async function discoverRendererUrl(timeoutMs = 60_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (let port = DEFAULT_PORT; port <= MAX_PORT; port++) {
      const url = `http://127.0.0.1:${port}`;
      if (await isViteServer(url)) {
        return url;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`等待渲染进程超时（扫描 127.0.0.1:${DEFAULT_PORT}-${MAX_PORT}）`);
}

/** 解析 URL 后 spawn electron dev */
async function main() {
  const presetUrl = process.env.ELECTRON_RENDERER_URL;
  const rendererUrl = presetUrl && (await isViteServer(presetUrl))
    ? presetUrl
    : await discoverRendererUrl();

  console.log(`[electron] 渲染进程地址: ${rendererUrl}`);

  const child = spawn('pnpm', ['--filter', '@desktop-agent/electron', 'dev'], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ELECTRON_RENDERER_URL: rendererUrl,
    },
  });

  child.on('exit', (code) => process.exit(code ?? 1));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
