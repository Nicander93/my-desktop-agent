/**
 * 跨平台 Shell 与 Git Bash 路径解析的共享常量和帮助函数。
 *
 * Runtime 使用这些纯函数选择子进程命令；调用方仍需在自己的环境副本中注入 PATH 和变量。
 */
import { join } from "node:path";

/** 指向受控 Git Bash 可执行文件的子进程环境变量，避免重新探测系统 PATH。 */
export const DESKTOP_AGENT_BASH_ENV = "DESKTOP_AGENT_BASH";

/** 在 PortableGit 的常见安装布局中定位 bash.exe，按兼容顺序返回第一个实际存在的路径。 */
export function resolveGitBashPath(
  gitRoot: string,
  exists: (path: string) => boolean = () => false,
): string | undefined {
  const candidates = [
    join(gitRoot, "bin", "bash.exe"),
    join(gitRoot, "usr", "bin", "bash.exe"),
    join(gitRoot, "mingw64", "bin", "bash.exe"),
  ];
  return candidates.find((candidate) => exists(candidate));
}

/** 返回 Git Bash 工具链 PATH 片段，包含 sed/grep 所在 usr/bin 与辅助目录。 */
export function getGitShellPathSegments(gitRoot: string): string[] {
  return [
    join(gitRoot, "usr", "bin"),
    join(gitRoot, "bin"),
    join(gitRoot, "mingw64", "bin"),
    join(gitRoot, "cmd"),
  ];
}

/** 构建 Git Bash 子进程环境，关闭 MSYS 路径自动转换以保护 Windows 参数语义。 */
export function buildGitBashEnv(bashPath: string): Record<string, string> {
  return {
    [DESKTOP_AGENT_BASH_ENV]: bashPath,
    MSYSTEM: "MINGW64",
    MSYS_NO_PATHCONV: "1",
    MSYS2_PATH_TYPE: "inherit",
  };
}
