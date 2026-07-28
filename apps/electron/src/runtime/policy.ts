/**
 * 子进程依赖落盘策略。
 * office / file-organizing / mcp / general → App 目录；coding → 工作区，并删掉 App 级 npm/uv 变量。
 * 默认只改 spawn 用的 env 副本（buildSubprocessEnv）；不修改全局 process.env。
 */
import {
  buildAppLevelEnv,
  buildBundledPathEnv,
  buildCodingEnv,
  buildGitBashEnv,
  getAppRuntimePaths,
  getGitBashRoot,
  resolveCommandIfBundled,
  resolveGitBashPath,
  type AppRuntimePaths,
} from '@desktop-agent/shared/runtime';
import { existsSync } from 'node:fs';
import type { AgentRuntimeProfile } from '@desktop-agent/shared';

export type DependencyScope = 'app' | 'workspace';

const APP_SCOPED_PROFILES: AgentRuntimeProfile[] = [
  'office',
  'office-pptx',
  'file-organizing',
  'mcp',
  'general',
];

/** coding 时必须删掉，否则 install 还是进 App store */
const APP_LEVEL_ONLY_KEYS = [
  'NPM_CONFIG_PREFIX',
  'NPM_CONFIG_CACHE',
  'npm_config_cache',
  'NPX_HOME',
  'UV_TOOL_DIR',
  'UV_PYTHON_INSTALL_DIR',
  'XDG_DATA_HOME',
] as const;

export function getDependencyScope(profile?: AgentRuntimeProfile): DependencyScope {
  if (profile === 'coding') return 'workspace';
  if (!profile || APP_SCOPED_PROFILES.includes(profile)) return 'app';
  return 'app';
}

export function getAgentEnv(
  profile?: AgentRuntimeProfile,
  paths: AppRuntimePaths = getAppRuntimePaths(),
): Record<string, string> {
  const scope = getDependencyScope(profile);
  if (scope === 'workspace') {
    return buildCodingEnv(paths);
  }
  return buildAppLevelEnv(paths);
}

/** process.env + profile 片段；coding 会 strip APP_LEVEL_ONLY_KEYS */
export function buildSubprocessEnv(
  profile?: AgentRuntimeProfile,
  paths: AppRuntimePaths = getAppRuntimePaths(),
): Record<string, string> {
  const profileEnv = getAgentEnv(profile, paths);
  const merged: Record<string, string> = { ...process.env } as Record<string, string>;

  for (const [key, value] of Object.entries(profileEnv)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  if (getDependencyScope(profile) === 'workspace') {
    for (const key of APP_LEVEL_ONLY_KEYS) {
      delete merged[key];
    }
  }

  if (process.platform === 'win32') {
    const bashPath = resolveGitBashPath(getGitBashRoot(paths), existsSync);
    if (bashPath) {
      Object.assign(merged, buildGitBashEnv(bashPath));
    }
  }

  return merged;
}

/**
 * 返回 bundled PATH 快照；不修改全局 process.env，避免影响用户系统运行时。
 * Agent / MCP 子进程通过 buildSubprocessEnv 使用隔离 env。
 */
export function applyBaseRuntimeEnv(
  paths: AppRuntimePaths = getAppRuntimePaths(),
): Record<string, string> {
  return { PATH: buildBundledPathEnv(paths, process.env.PATH) };
}

/** stdio MCP 合并进 subprocessEnv；sse/http 原样返回 */
export function mergeRuntimeEnvIntoMcpServers(
  servers: Record<string, unknown>,
  subprocessEnv: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [name, config] of Object.entries(servers)) {
    const entry = config as Record<string, unknown>;
    const transport = (entry.type as string | undefined) ?? 'stdio';
    if (transport !== 'stdio') {
      out[name] = entry;
      continue;
    }
    out[name] = {
      ...entry,
      env: {
        ...subprocessEnv,
        ...((entry.env as Record<string, string> | undefined) ?? {}),
      },
    };
  }

  return out;
}

export function createBundledCommandResolver(
  paths: AppRuntimePaths = getAppRuntimePaths(),
): (command: string) => string {
  return (command: string) => resolveCommandIfBundled(paths, command);
}
