/**
 * McpServerRecord → open-agent-sdk 可消费的 MCP 配置。
 * 占位符替换、导入 JSON 解析也在这；连子进程测通见 agent-runtime/mcp.ts。
 */
import type {
  McpImportFile,
  McpImportServerConfig,
  McpServerRecord,
} from "../types/mcp.js";

/** workspace / secrets 注入；commandResolver 把 npx/uvx 换成 bundled 绝对路径 */
export interface McpBuildContext {
  workspacePath?: string;
  secrets?: Record<string, string>;
  /** 将 npx/uvx 等解析为 bundled 绝对路径 */
  commandResolver?: McpCommandResolver;
}

/** 返回替换后的可执行路径，未识别则原样返回 */
export type McpCommandResolver = (command: string) => string;

/**
 * 用工作区路径和调用时提供的 secrets 替换配置文本中的受支持占位符。
 */
function replacePlaceholders(value: string, ctx: McpBuildContext): string {
  let result = value;
  if (ctx.workspacePath) {
    result = result.replace(/\{workspace\}/g, ctx.workspacePath);
  }
  if (ctx.secrets) {
    for (const [key, secretValue] of Object.entries(ctx.secrets)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, "g"), secretValue);
    }
  }
  return result;
}

/**
 * 解析服务环境或 HTTP headers 中每个值的占位符，不修改持久化原对象。
 */
function resolveEnv(
  env: Record<string, string> | undefined,
  ctx: McpBuildContext,
): Record<string, string> | undefined {
  if (!env) return undefined;
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    resolved[key] = replacePlaceholders(value, ctx);
  }
  return resolved;
}

/** 跳过 disabled 或缺 command/url 的项；stdio 与 sse/http 字段形状不同 */
export function buildMcpServersForSdk(
  servers: McpServerRecord[],
  ctx: McpBuildContext = {},
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};

  for (const server of servers) {
    if (!server.enabled) continue;

    if (server.transport === "stdio") {
      if (!server.command) continue;
      const command = ctx.commandResolver
        ? ctx.commandResolver(server.command)
        : server.command;
      out[server.name] = {
        type: "stdio",
        command,
        args: server.args.map((arg) => replacePlaceholders(arg, ctx)),
        ...(resolveEnv(server.env, ctx)
          ? { env: resolveEnv(server.env, ctx) }
          : {}),
      };
      continue;
    }

    if (!server.url) continue;
    out[server.name] = {
      type: server.transport,
      url: replacePlaceholders(server.url, ctx),
      ...(resolveEnv(server.env, ctx)
        ? { headers: resolveEnv(server.env, ctx) }
        : {}),
    };
  }

  return out;
}

/** 支持双引号包裹的参数，导入 UI 粘贴整行命令时用 */
export function parseCommandLine(commandLine: string): {
  command: string;
  args: string[];
} {
  const parts = commandLine.trim().match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  const normalized = parts.map((part) => part.replace(/^"|"$/g, ""));
  return {
    command: normalized[0] ?? "",
    args: normalized.slice(1),
  };
}

/** 缺 mcpServers 或 JSON 非法时抛错 */
export function parseMcpImportJson(
  raw: string,
): Array<{ name: string; config: McpImportServerConfig }> {
  const parsed = JSON.parse(raw) as McpImportFile;
  if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
    throw new Error("JSON 格式无效，需要 mcpServers 字段");
  }

  return Object.entries(parsed.mcpServers).map(([name, config]) => ({
    name,
    config,
  }));
}

/** 导入配置 → 落库前的 McpServerRecord 字段；stdio 无 command 时抛错 */
export function importConfigToServerInput(
  name: string,
  config: McpImportServerConfig,
): {
  name: string;
  transport: "stdio" | "sse" | "http";
  command: string | null;
  args: string[];
  url: string | null;
  env: Record<string, string>;
} {
  const transport =
    config.type ??
    (config.url ? (config.url.includes("/sse") ? "sse" : "http") : "stdio");

  if (transport === "stdio") {
    if (config.command) {
      return {
        name,
        transport: "stdio",
        command: config.command,
        args: config.args ?? [],
        url: null,
        env: config.env ?? {},
      };
    }
    throw new Error(`MCP "${name}" 缺少 command`);
  }

  if (!config.url) {
    throw new Error(`MCP "${name}" 缺少 url`);
  }

  return {
    name,
    transport,
    command: null,
    args: [],
    url: config.url,
    env: config.headers ?? config.env ?? {},
  };
}
