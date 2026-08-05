/**
 * 评测子进程环境：对齐 Electron buildSubprocessEnv 的 Windows Git Bash 注入。
 * 不依赖 apps/electron；用 shared runtime 路径约定。
 */
import { existsSync } from "node:fs";
import {
  buildBundledPathEnv,
  buildGitBashEnv,
  getAppRuntimePaths,
  getGitBashRoot,
  resolveGitBashPath,
} from "@desktop-agent/shared/runtime";

/**
 * 构造评测 Agent 子进程环境，复用应用 runtime PATH，并在 Windows 注入受控 Git Bash。
 */
export function buildEvalSubprocessEnv(options?: {
  platform?: NodeJS.Platform;
  homeDir?: string;
  pathEnv?: string;
  exists?: (path: string) => boolean;
}): Record<string, string> {
  const platform = options?.platform ?? process.platform;
  const homeDir =
    options?.homeDir ?? process.env.USERPROFILE ?? process.env.HOME ?? "";
  const exists = options?.exists ?? existsSync;
  const paths = getAppRuntimePaths(homeDir);
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PATH: buildBundledPathEnv(
      paths,
      options?.pathEnv ?? process.env.PATH,
      platform,
    ),
  };

  if (platform === "win32") {
    const gitBashRoot = getGitBashRoot(paths);
    const bashPath = resolveGitBashPath(gitBashRoot, exists);
    if (!bashPath) {
      throw new Error(
        `Bundled Git Bash not found under ${gitBashRoot}. Run: pnpm setup:binaries`,
      );
    }
    Object.assign(env, buildGitBashEnv(bashPath));
  }

  return env;
}
