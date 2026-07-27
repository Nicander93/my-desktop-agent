import { join } from 'node:path';

export const DESKTOP_AGENT_BASH_ENV = 'DESKTOP_AGENT_BASH';

/** PortableGit（git-bash 目录）常见 bash 位置 */
export function resolveGitBashPath(
  gitRoot: string,
  exists: (path: string) => boolean = () => false,
): string | undefined {
  const candidates = [
    join(gitRoot, 'bin', 'bash.exe'),
    join(gitRoot, 'usr', 'bin', 'bash.exe'),
    join(gitRoot, 'mingw64', 'bin', 'bash.exe'),
  ];
  return candidates.find((candidate) => exists(candidate));
}

/** Git Bash 工具链目录（sed/grep 等在 usr/bin） */
export function getGitShellPathSegments(gitRoot: string): string[] {
  return [
    join(gitRoot, 'usr', 'bin'),
    join(gitRoot, 'bin'),
    join(gitRoot, 'mingw64', 'bin'),
    join(gitRoot, 'cmd'),
  ];
}

export function buildGitBashEnv(bashPath: string): Record<string, string> {
  return {
    [DESKTOP_AGENT_BASH_ENV]: bashPath,
    MSYSTEM: 'MINGW64',
    MSYS_NO_PATHCONV: '1',
    MSYS2_PATH_TYPE: 'inherit',
  };
}
