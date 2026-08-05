/**
 * App 运行时路径与环境变量
 *
 * 目录约定（均在用户主目录 ~/.desktop-agent/ 下）：
 * - binaries/  运行时（node、MinGit、git-bash、uv），均在 ~/.desktop-agent/ 内，不写入系统目录
 * - store/     npm/uv 包与缓存，MCP 等依赖装在这里，不污染系统或工作区
 */
import { join } from "node:path";
import { getPythonPathSegments } from "./python.js";
import { getGitShellPathSegments } from "./shell.js";

/** 用户主目录下应用独占运行时根目录名，禁止把依赖写入工作区或系统目录。 */
export const APP_DIR_NAME = ".desktop-agent";
/** bundled MinGit 解压后的目录名。 */
export const GIT_BASH_DIR = "git-bash";

/** 计算 bundled Git Bash 根目录，供 shell 路径片段解析。 */
export function getGitBashRoot(paths: AppRuntimePaths): string {
  return join(paths.binaries.root, GIT_BASH_DIR);
}

/** 可由 runtime 解析为受控绝对路径的命令别名。 */
export type BundledCommandName = "node" | "npm" | "npx" | "git" | "uv" | "uvx";

/** bundled 可执行文件和工具缓存的完整目录布局。 */
export interface AppRuntimePaths {
  root: string;
  /** 可执行文件目录 */
  binaries: {
    root: string;
    node: string;
    git: string;
    uv: string;
  };
  /** npm/npx/uv 包与缓存目录 */
  store: {
    root: string;
    npmPrefix: string;
    npmCache: string;
    npxHome: string;
    uvCache: string;
    uvTools: string;
    uvPython: string;
    pipCache: string;
  };
}

/** 从用户 home 派生应用私有运行时路径；测试可显式传入临时 home。 */
export function getAppRuntimePaths(
  homeDir = process.env.USERPROFILE || process.env.HOME || "",
): AppRuntimePaths {
  const root = join(homeDir, APP_DIR_NAME);
  const binariesRoot = join(root, "binaries");
  const storeRoot = join(root, "store");

  return {
    root,
    binaries: {
      root: binariesRoot,
      node: join(binariesRoot, "node"),
      // MinGit 的 git.exe 在 cmd/ 子目录（仅 App 内使用，不替换系统 Git）
      git: join(binariesRoot, "git", "cmd"),
      uv: join(binariesRoot, "uv"),
    },
    store: {
      root: storeRoot,
      npmPrefix: join(storeRoot, "npm", "prefix"),
      npmCache: join(storeRoot, "npm", "cache"),
      npxHome: join(storeRoot, "npm", "npx"),
      uvCache: join(storeRoot, "uv", "cache"),
      uvTools: join(storeRoot, "uv", "tools"),
      uvPython: join(storeRoot, "uv", "python"),
      pipCache: join(storeRoot, "pip", "cache"),
    },
  };
}

/** 将 bundled 路径前置到 PATH，优先于系统安装（仅用于 Agent 子进程 env 副本） */
/** 按平台分隔符将去空路径前置到 PATH，不改写原有系统路径。 */
function prependPath(
  existingPath: string | undefined,
  segments: string[],
  platform = process.platform,
): string {
  const sep = platform === "win32" ? ";" : ":";
  const normalized = segments.filter(Boolean);
  if (!existingPath) return normalized.join(sep);
  return `${normalized.join(sep)}${sep}${existingPath}`;
}

/** 构建 bundled 命令的 PATH 优先级；Windows 额外包含 Python 与 Git Bash 辅助目录。 */
export function getBundledPathSegments(
  paths: AppRuntimePaths,
  platform = process.platform,
): string[] {
  const segments: string[] = [];

  if (platform === "win32") {
    segments.push(...getPythonPathSegments(paths.store.root));
    segments.push(paths.binaries.node, paths.binaries.uv, paths.binaries.git);
    segments.push(...getGitShellPathSegments(getGitBashRoot(paths)));
  } else {
    segments.push(paths.binaries.node, paths.binaries.uv, paths.binaries.git);
  }

  return [...new Set(segments.filter(Boolean))];
}

/** 将 bundled PATH 片段合并到给定父环境，供子进程专用。 */
export function buildBundledPathEnv(
  paths: AppRuntimePaths,
  existingPath?: string,
  platform = process.platform,
): string {
  return prependPath(
    existingPath,
    getBundledPathSegments(paths, platform),
    platform,
  );
}

/** 为通用 Agent 场景构建隔离环境，npm/uv/pip 所有缓存均落入 app store。 */
export function buildAppLevelEnv(
  paths: AppRuntimePaths,
  existingEnv: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
): Record<string, string> {
  const pathValue = buildBundledPathEnv(paths, existingEnv.PATH, platform);

  return {
    PATH: pathValue,
    NPM_CONFIG_PREFIX: paths.store.npmPrefix,
    NPM_CONFIG_CACHE: paths.store.npmCache,
    npm_config_cache: paths.store.npmCache,
    NPX_HOME: paths.store.npxHome,
    UV_CACHE_DIR: paths.store.uvCache,
    UV_PYTHON_INSTALL_DIR: paths.store.uvPython,
    UV_TOOL_DIR: paths.store.uvTools,
    PIP_CACHE_DIR: paths.store.pipCache,
    // uv 在 Windows 上也会读 XDG 变量
    XDG_CACHE_HOME: paths.store.uvCache,
    XDG_DATA_HOME: paths.store.uvTools,
  };
}

/** 为编码场景构建环境：仍使用 bundled runtime，但不强制 npm/pip 安装目录离开项目。 */
export function buildCodingEnv(
  paths: AppRuntimePaths,
  existingEnv: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
): Record<string, string> {
  return {
    PATH: buildBundledPathEnv(paths, existingEnv.PATH, platform),
    UV_CACHE_DIR: paths.store.uvCache,
    PIP_CACHE_DIR: paths.store.pipCache,
  };
}

/** 将命令别名转换为 Windows 实际可执行文件名，npm/npx 必须使用 .cmd。 */
function windowsCommand(baseDir: string, name: BundledCommandName): string {
  const map: Record<BundledCommandName, string> = {
    node: "node.exe",
    npm: "npm.cmd",
    npx: "npx.cmd",
    git: "git.exe",
    uv: "uv.exe",
    uvx: "uvx.exe",
  };
  return join(baseDir, map[name]);
}

/** 解析命令别名到平台正确的 bundled 绝对路径，避免受系统 PATH 影响。 */
export function resolveBundledCommand(
  paths: AppRuntimePaths,
  name: BundledCommandName,
  platform = process.platform,
): string {
  if (platform === "win32") {
    if (name === "git") return windowsCommand(paths.binaries.git, name);
    if (name === "node" || name === "npm" || name === "npx") {
      return windowsCommand(paths.binaries.node, name);
    }
    return windowsCommand(paths.binaries.uv, name);
  }

  return join(
    name === "git"
      ? paths.binaries.git
      : name === "node" || name === "npm" || name === "npx"
        ? paths.binaries.node
        : paths.binaries.uv,
    name,
  );
}

/** 允许 MCP/工具启动时重写为 bundled 路径的命令白名单。 */
export const BUNDLED_COMMAND_ALIASES: BundledCommandName[] = [
  "node",
  "npm",
  "npx",
  "git",
  "uv",
  "uvx",
];

/** 将白名单命令重写为 bundled 绝对路径；未知命令必须原样保留。 */
export function resolveCommandIfBundled(
  paths: AppRuntimePaths,
  command: string,
  platform = process.platform,
): string {
  const base = command.replace(/\.(exe|cmd)$/i, "").toLowerCase();
  if (BUNDLED_COMMAND_ALIASES.includes(base as BundledCommandName)) {
    return resolveBundledCommand(paths, base as BundledCommandName, platform);
  }
  return command;
}
