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
} from "@desktop-agent/shared/runtime";
import { existsSync } from "node:fs";
import type { AgentRuntimeProfile } from "@desktop-agent/shared";

/**
 * 子进程依赖写入的位置范围。
 *
 * app 范围隔离办公与通用工具，workspace 范围允许 coding 任务使用项目自己的包管理配置。
 */
export type DependencyScope = "app" | "workspace";

/**
 * 默认使用 App 级依赖目录的 Profile 集合。
 *
 * 这些任务不应改变用户项目的依赖树；coding 是唯一明确允许 workspace 范围的 Profile。
 */
const APP_SCOPED_PROFILES: AgentRuntimeProfile[] = [
  "office",
  "office-pptx",
  "file-organizing",
  "mcp",
  "general",
];

/**
 * coding 子进程必须移除的 App 级包管理变量。
 *
 * 保留任一变量都会让项目安装命令错误写入 App store，而不是工作区预期的位置。
 */
const APP_LEVEL_ONLY_KEYS = [
  "NPM_CONFIG_PREFIX",
  "NPM_CONFIG_CACHE",
  "npm_config_cache",
  "NPX_HOME",
  "UV_TOOL_DIR",
  "UV_PYTHON_INSTALL_DIR",
  "XDG_DATA_HOME",
] as const;

/**
 * 根据 Runtime Profile 决定子进程依赖的落盘范围。
 *
 * 未知 Profile 保守地使用 app 范围，避免非 coding 任务污染用户工作区。
 */
export function getDependencyScope(
  profile?: AgentRuntimeProfile,
): DependencyScope {
  if (profile === "coding") return "workspace";
  if (!profile || APP_SCOPED_PROFILES.includes(profile)) return "app";
  return "app";
}

/**
 * 构造不包含全局环境变量的 Profile 专属环境片段。
 *
 * 调用方应通过 `buildSubprocessEnv` 合并基础环境，避免遗漏 PATH 等系统变量。
 */
export function getAgentEnv(
  profile?: AgentRuntimeProfile,
  paths: AppRuntimePaths = getAppRuntimePaths(),
): Record<string, string> {
  const scope = getDependencyScope(profile);
  if (scope === "workspace") {
    return buildCodingEnv(paths);
  }
  return buildAppLevelEnv(paths);
}

/**
 * 构造传给 Agent 与子进程的隔离环境副本。
 *
 * coding 会清理 App 级变量；Windows 额外注入 bundled Git Bash，整个过程不修改全局 `process.env`。
 */
export function buildSubprocessEnv(
  profile?: AgentRuntimeProfile,
  paths: AppRuntimePaths = getAppRuntimePaths(),
): Record<string, string> {
  const profileEnv = getAgentEnv(profile, paths);
  const merged: Record<string, string> = { ...process.env } as Record<
    string,
    string
  >;

  for (const [key, value] of Object.entries(profileEnv)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  if (getDependencyScope(profile) === "workspace") {
    for (const key of APP_LEVEL_ONLY_KEYS) {
      delete merged[key];
    }
  }

  if (process.platform === "win32") {
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

/**
 * 为 stdio MCP 合并隔离子进程环境，保持 sse/http 网络配置原样不变。
 *
 * Server 自己的 env 最后合并并优先，允许其显式覆盖通用 Runtime 值。
 */
export function mergeRuntimeEnvIntoMcpServers(
  servers: Record<string, unknown>,
  subprocessEnv: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [name, config] of Object.entries(servers)) {
    const entry = config as Record<string, unknown>;
    const transport = (entry.type as string | undefined) ?? "stdio";
    if (transport !== "stdio") {
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

/**
 * 创建将已 bundled 命令替换为本地二进制路径的解析器。
 *
 * 只转换已知 bundled 命令，其余命令维持原样以保留用户工作区的正常工具解析。
 */
export function createBundledCommandResolver(
  paths: AppRuntimePaths = getAppRuntimePaths(),
): (command: string) => string {
  return (command: string) => resolveCommandIfBundled(paths, command);
}
