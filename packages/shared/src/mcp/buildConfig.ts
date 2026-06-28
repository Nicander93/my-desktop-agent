import type { McpImportFile, McpImportServerConfig, McpServerRecord } from '../types/mcp.js';

export interface McpBuildContext {
  workspacePath?: string;
  secrets?: Record<string, string>;
}

function replacePlaceholders(value: string, ctx: McpBuildContext): string {
  let result = value;
  if (ctx.workspacePath) {
    result = result.replace(/\{workspace\}/g, ctx.workspacePath);
  }
  if (ctx.secrets) {
    for (const [key, secretValue] of Object.entries(ctx.secrets)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), secretValue);
    }
  }
  return result;
}

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

export function buildMcpServersForSdk(
  servers: McpServerRecord[],
  ctx: McpBuildContext = {},
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};

  for (const server of servers) {
    if (!server.enabled) continue;

    if (server.transport === 'stdio') {
      if (!server.command) continue;
      out[server.name] = {
        type: 'stdio',
        command: server.command,
        args: server.args.map((arg) => replacePlaceholders(arg, ctx)),
        ...(resolveEnv(server.env, ctx) ? { env: resolveEnv(server.env, ctx) } : {}),
      };
      continue;
    }

    if (!server.url) continue;
    out[server.name] = {
      type: server.transport,
      url: replacePlaceholders(server.url, ctx),
      ...(resolveEnv(server.env, ctx) ? { headers: resolveEnv(server.env, ctx) } : {}),
    };
  }

  return out;
}

export function parseCommandLine(commandLine: string): { command: string; args: string[] } {
  const parts = commandLine.trim().match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  const normalized = parts.map((part) => part.replace(/^"|"$/g, ''));
  return {
    command: normalized[0] ?? '',
    args: normalized.slice(1),
  };
}

export function parseMcpImportJson(raw: string): Array<{ name: string; config: McpImportServerConfig }> {
  const parsed = JSON.parse(raw) as McpImportFile;
  if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
    throw new Error('JSON 格式无效，需要 mcpServers 字段');
  }

  return Object.entries(parsed.mcpServers).map(([name, config]) => ({ name, config }));
}

export function importConfigToServerInput(
  name: string,
  config: McpImportServerConfig,
): {
  name: string;
  transport: 'stdio' | 'sse' | 'http';
  command: string | null;
  args: string[];
  url: string | null;
  env: Record<string, string>;
} {
  const transport = config.type ?? (config.url ? (config.url.includes('/sse') ? 'sse' : 'http') : 'stdio');

  if (transport === 'stdio') {
    if (config.command) {
      return {
        name,
        transport: 'stdio',
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
