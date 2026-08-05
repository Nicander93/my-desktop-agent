/**
 * MCP 子进程预装、连通性测试、session 配置构建。
 * Record → SDK 配置在 shared/buildConfig；设置页测连接走 testMcpConnection。
 */
import { spawn } from "node:child_process";
import { basename } from "node:path";
import {
  buildMcpServersForSdk,
  type McpServerRecord,
  type McpToolInfo,
} from "@desktop-agent/shared";

const INSTALL_TIMEOUT_MS = 180_000;
const DEFAULT_TEST_TIMEOUT_MS = 60_000;

/**
 * MCP 连通性测试的超时、预装跳过和子进程环境覆盖选项。
 */
export type McpConnectionTestOptions = {
  timeoutMs?: number;
  skipPreinstall?: boolean;
  /** 合并进 MCP 子进程的环境变量 */
  subprocessEnv?: Record<string, string>;
};

/**
 * 传给 MCP SDK transport 构造器的适配后服务配置。
 */
type SdkConfig = Record<string, unknown>;

/** 从绝对路径提取 npx/uvx 等命令名，预装分支判断用 */
export function resolveSpawnCommandName(command: string): string {
  return basename(command)
    .replace(/\.(exe|cmd)$/i, "")
    .toLowerCase();
}

/**
 * 合并继承环境、应用运行时环境和服务专属环境；服务配置拥有最高优先级。
 */
function mergeSpawnEnv(
  config: SdkConfig,
  subprocessEnv?: Record<string, string>,
): Record<string, string> {
  const configEnv = (config.env as Record<string, string> | undefined) ?? {};
  return {
    ...process.env,
    ...subprocessEnv,
    ...configEnv,
  } as Record<string, string>;
}

/**
 * 在受限时长内运行预热进程，并将 spawn、非零退出与超时转换为统一结果。
 *
 * 超时仅终止子进程；对允许非零退出的探测命令仍视为预热完成。
 */
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
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    /**
     * 确保错误、退出和超时竞争时只结算一次并清理定时器。
     */
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

    child.on("error", (err: Error) => {
      finish({ success: false, error: err.message });
    });

    child.on("exit", (code: number | null) => {
      if (tolerateNonZeroExit || code === 0 || code === null) {
        finish({ success: true });
        return;
      }
      finish({ success: false, error: `进程退出码 ${code}` });
    });
  });
}

/** uvx 拉包、npx 预热；非 stdio 或未知命令直接跳过 */
export async function preinstallMcpDependencies(
  config: SdkConfig,
  subprocessEnv?: Record<string, string>,
): Promise<{ success: boolean; error?: string }> {
  const type = (config.type as string | undefined) ?? "stdio";
  if (type !== "stdio") return { success: true };

  const command = config.command as string | undefined;
  const args = (config.args as string[]) ?? [];
  if (!command) return { success: true };

  const spawnEnv = mergeSpawnEnv(config, subprocessEnv);
  const cmd = resolveSpawnCommandName(command);

  if (cmd === "uvx" && args.length >= 1) {
    return runProcess(
      command,
      [args[0], "--help"],
      spawnEnv,
      INSTALL_TIMEOUT_MS,
    );
  }

  if (cmd === "npx") {
    return runProcess(command, args, spawnEnv, 30_000, true);
  }

  return { success: true };
}

/**
 * 根据服务类型延迟加载对应 MCP transport，并仅把 stdio 环境传给本地子进程。
 */
async function createTransport(
  config: SdkConfig,
  subprocessEnv?: Record<string, string>,
) {
  const type = (config.type as string | undefined) ?? "stdio";

  if (type === "stdio") {
    const { StdioClientTransport } =
      await import("@modelcontextprotocol/sdk/client/stdio.js");
    return new StdioClientTransport({
      command: config.command as string,
      args: (config.args as string[]) ?? [],
      env: mergeSpawnEnv(config, subprocessEnv) as Record<string, string>,
    });
  }

  if (type === "sse") {
    const { SSEClientTransport } =
      await import("@modelcontextprotocol/sdk/client/sse.js");
    return new SSEClientTransport(new URL(config.url as string), {
      requestInit: config.headers
        ? { headers: config.headers as Record<string, string> }
        : undefined,
    });
  }

  if (type === "http") {
    const { StreamableHTTPClientTransport } =
      await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    return new StreamableHTTPClientTransport(new URL(config.url as string), {
      requestInit: config.headers
        ? { headers: config.headers as Record<string, string> }
        : undefined,
    });
  }

  throw new Error(`Unsupported MCP transport type: ${type}`);
}

/** 连上后 listTools；失败返回 error 字符串，不关进程泄漏由 SDK 处理 */
export async function testMcpConnection(
  name: string,
  config: SdkConfig,
  options?: McpConnectionTestOptions,
): Promise<{ success: boolean; tools: McpToolInfo[]; error?: string }> {
  if (!options?.skipPreinstall) {
    const pre = await preinstallMcpDependencies(config, options?.subprocessEnv);
    if (!pre.success) {
      return { success: false, tools: [], error: pre.error || "依赖下载失败" };
    }
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS;
  const requestOptions = { timeout: timeoutMs, maxTotalTimeout: timeoutMs };

  try {
    const { Client } =
      await import("@modelcontextprotocol/sdk/client/index.js");
    const transport = await createTransport(config, options?.subprocessEnv);
    const client = new Client(
      { name: `desktop-agent-${name}`, version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(transport, requestOptions);
    const toolList = await client.listTools(undefined, requestOptions);
    const tools = (toolList.tools ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
    }));

    await client.close();
    return { success: true, tools };
  } catch (error) {
    return {
      success: false,
      tools: [],
      error: error instanceof Error ? error.message : "连接失败",
    };
  }
}

/** 设置页「启用」：先预装再测通，返回工具列表 */
export async function setupMcpServer(
  name: string,
  config: SdkConfig,
  options?: Pick<McpConnectionTestOptions, "subprocessEnv">,
): Promise<{ success: boolean; tools: McpToolInfo[]; error?: string }> {
  const pre = await preinstallMcpDependencies(config, options?.subprocessEnv);
  if (!pre.success) {
    return { success: false, tools: [], error: pre.error || "依赖下载失败" };
  }
  return testMcpConnection(name, config, {
    skipPreinstall: true,
    subprocessEnv: options?.subprocessEnv,
  });
}

/** 会话启动时把已启用 McpServerRecord 转成 SDK servers 字段 */
export function buildSessionMcpServers(
  servers: McpServerRecord[],
  workspacePath?: string,
  options?: { commandResolver?: (command: string) => string },
): Record<string, unknown> {
  return buildMcpServersForSdk(servers, {
    workspacePath,
    commandResolver: options?.commandResolver,
  });
}
