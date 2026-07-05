/**
 * 依赖安装策略：办公场景 App 级 store，Coding 场景允许项目内 install。
 */
import {
  buildAppLevelEnv,
  buildBundledPathEnv,
  buildCodingEnv,
  getAppRuntimePaths,
  resolveCommandIfBundled,
  type AppRuntimePaths,
} from '@desktop-agent/shared/runtime';
import type { AgentRuntimeProfile } from '@desktop-agent/shared';

export type DependencyScope = 'app' | 'workspace';

const APP_SCOPED_PROFILES: AgentRuntimeProfile[] = [
  'office',
  'file-organizing',
  'mcp',
  'general',
];

/** coding profile 下需要从子进程 env 中移除的 App 级 key */
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

/**
 * 构建单次 spawn 使用的完整 env，按 profile 隔离，不修改全局 process.env。
 */
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

  return merged;
}

export function applyBaseRuntimeEnv(
  paths: AppRuntimePaths = getAppRuntimePaths(),
): Record<string, string> {
  const pathValue = buildBundledPathEnv(paths, process.env.PATH);
  process.env.PATH = pathValue;
  return { PATH: pathValue };
}

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
