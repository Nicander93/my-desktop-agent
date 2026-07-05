/**
 * App 运行时路径与环境变量
 *
 * 目录约定（均在用户主目录 ~/.desktop-agent/ 下）：
 * - binaries/  运行时（node、git、uv），随 App 版本更新
 * - store/     npm/uv 包与缓存，MCP 等依赖装在这里，不污染系统或工作区
 */
import { join } from 'node:path';

export const APP_DIR_NAME = '.desktop-agent';

export type BundledCommandName = 'node' | 'npm' | 'npx' | 'git' | 'uv' | 'uvx';

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

export function getAppRuntimePaths(homeDir = process.env.USERPROFILE || process.env.HOME || ''): AppRuntimePaths {
  const root = join(homeDir, APP_DIR_NAME);
  const binariesRoot = join(root, 'binaries');
  const storeRoot = join(root, 'store');

  return {
    root,
    binaries: {
      root: binariesRoot,
      node: join(binariesRoot, 'node'),
      // PortableGit / MinGit 的 git.exe 在 cmd/ 子目录
      git: join(binariesRoot, 'git', 'cmd'),
      uv: join(binariesRoot, 'uv'),
    },
    store: {
      root: storeRoot,
      npmPrefix: join(storeRoot, 'npm', 'prefix'),
      npmCache: join(storeRoot, 'npm', 'cache'),
      npxHome: join(storeRoot, 'npm', 'npx'),
      uvCache: join(storeRoot, 'uv', 'cache'),
      uvTools: join(storeRoot, 'uv', 'tools'),
      uvPython: join(storeRoot, 'uv', 'python'),
      pipCache: join(storeRoot, 'pip', 'cache'),
    },
  };
}

/** 将 bundled 路径前置到 PATH，优先于系统安装 */
function prependPath(existingPath: string | undefined, segments: string[], platform = process.platform): string {
  const sep = platform === 'win32' ? ';' : ':';
  const normalized = segments.filter(Boolean);
  if (!existingPath) return normalized.join(sep);
  return `${normalized.join(sep)}${sep}${existingPath}`;
}

export function buildBundledPathEnv(
  paths: AppRuntimePaths,
  existingPath?: string,
  platform = process.platform,
): string {
  return prependPath(
    existingPath,
    [paths.binaries.node, paths.binaries.uv, paths.binaries.git],
    platform,
  );
}

/** 办公/通用场景：npm、uv 包装进 store，不写入工作区或系统目录 */
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

/** Coding 场景：仍用 bundled 运行时，但允许 npm/pip 装到项目目录 */
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

function windowsCommand(baseDir: string, name: BundledCommandName): string {
  const map: Record<BundledCommandName, string> = {
    node: 'node.exe',
    npm: 'npm.cmd',
    npx: 'npx.cmd',
    git: 'git.exe',
    uv: 'uv.exe',
    uvx: 'uvx.exe',
  };
  return join(baseDir, map[name]);
}

export function resolveBundledCommand(
  paths: AppRuntimePaths,
  name: BundledCommandName,
  platform = process.platform,
): string {
  if (platform === 'win32') {
    if (name === 'git') return windowsCommand(paths.binaries.git, name);
    if (name === 'node' || name === 'npm' || name === 'npx') {
      return windowsCommand(paths.binaries.node, name);
    }
    return windowsCommand(paths.binaries.uv, name);
  }

  return join(
    name === 'git' ? paths.binaries.git : name === 'node' || name === 'npm' || name === 'npx'
      ? paths.binaries.node
      : paths.binaries.uv,
    name,
  );
}

export const BUNDLED_COMMAND_ALIASES: BundledCommandName[] = ['node', 'npm', 'npx', 'git', 'uv', 'uvx'];

/** MCP 启动时将 npx/uvx 等解析为 bundled 绝对路径，避免误用系统 PATH */
export function resolveCommandIfBundled(
  paths: AppRuntimePaths,
  command: string,
  platform = process.platform,
): string {
  const base = command.replace(/\.(exe|cmd)$/i, '').toLowerCase();
  if (BUNDLED_COMMAND_ALIASES.includes(base as BundledCommandName)) {
    return resolveBundledCommand(paths, base as BundledCommandName, platform);
  }
  return command;
}
