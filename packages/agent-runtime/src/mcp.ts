import { spawn } from 'node:child_process';
import { buildMcpServersForSdk, type McpServerRecord, type McpToolInfo } from '@desktop-agent/shared';

const INSTALL_TIMEOUT_MS = 180_000;
const DEFAULT_TEST_TIMEOUT_MS = 60_000;

export type McpConnectionTestOptions = {
  timeoutMs?: number;
  skipPreinstall?: boolean;
};

type SdkConfig = Record<string, unknown>;

function runProcess(
  command: string,
  args: string[],
  env: Record<string, string>,
  timeoutMs: number,
  tolerateNonZeroExit = false,
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const finish = (result: { success: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill();
      finish({ success: true });
    }, timeoutMs);

    child.on('error', (err: Error) => {
      finish({ success: false, error: err.message });
    });

    child.on('exit', (code: number | null) => {
      if (tolerateNonZeroExit || code === 0 || code === null) {
        finish({ success: true });
        return;
      }
      finish({ success: false, error: `进程退出码 ${code}` });
    });
  });
}

export async function preinstallMcpDependencies(
  config: SdkConfig,
): Promise<{ success: boolean; error?: string }> {
  const type = (config.type as string | undefined) ?? 'stdio';
  if (type !== 'stdio') return { success: true };

  const command = config.command as string | undefined;
  const args = (config.args as string[]) ?? [];
  const env = (config.env as Record<string, string>) ?? {};
  if (!command) return { success: true };

  if (command === 'uvx' && args.length >= 1) {
    return runProcess(command, [args[0], '--help'], env, INSTALL_TIMEOUT_MS);
  }

  if (command === 'npx') {
    return runProcess(command, args, env, 30_000, true);
  }

  return { success: true };
}

async function createTransport(config: SdkConfig) {
  const type = (config.type as string | undefined) ?? 'stdio';

  if (type === 'stdio') {
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    const env = (config.env as Record<string, string> | undefined) ?? {};
    return new StdioClientTransport({
      command: config.command as string,
      args: (config.args as string[]) ?? [],
      env: { ...process.env, ...env } as Record<string, string>,
    });
  }

  if (type === 'sse') {
    const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
    return new SSEClientTransport(new URL(config.url as string), {
      requestInit: config.headers ? { headers: config.headers as Record<string, string> } : undefined,
    });
  }

  if (type === 'http') {
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
    return new StreamableHTTPClientTransport(new URL(config.url as string), {
      requestInit: config.headers ? { headers: config.headers as Record<string, string> } : undefined,
    });
  }

  throw new Error(`Unsupported MCP transport type: ${type}`);
}

export async function testMcpConnection(
  name: string,
  config: SdkConfig,
  options?: McpConnectionTestOptions,
): Promise<{ success: boolean; tools: McpToolInfo[]; error?: string }> {
  if (!options?.skipPreinstall) {
    const pre = await preinstallMcpDependencies(config);
    if (!pre.success) {
      return { success: false, tools: [], error: pre.error || '依赖下载失败' };
    }
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS;
  const requestOptions = { timeout: timeoutMs, maxTotalTimeout: timeoutMs };

  try {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const transport = await createTransport(config);
    const client = new Client({ name: `desktop-agent-${name}`, version: '1.0.0' }, { capabilities: {} });

    await client.connect(transport, requestOptions);
    const toolList = await client.listTools(undefined, requestOptions);
    const tools = (toolList.tools ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description ?? '',
    }));

    await client.close();
    return { success: true, tools };
  } catch (error) {
    return {
      success: false,
      tools: [],
      error: error instanceof Error ? error.message : '连接失败',
    };
  }
}

export async function setupMcpServer(
  name: string,
  config: SdkConfig,
): Promise<{ success: boolean; tools: McpToolInfo[]; error?: string }> {
  const pre = await preinstallMcpDependencies(config);
  if (!pre.success) {
    return { success: false, tools: [], error: pre.error || '依赖下载失败' };
  }
  return testMcpConnection(name, config, { skipPreinstall: true });
}

export function buildSessionMcpServers(
  servers: McpServerRecord[],
  workspacePath?: string,
): Record<string, unknown> {
  return buildMcpServersForSdk(servers, { workspacePath });
}
