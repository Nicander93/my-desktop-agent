/**
 * 跨平台 shell 解析。Windows 优先 bundled Git Bash（DESKTOP_AGENT_BASH env）。
 */
export const DESKTOP_AGENT_BASH_ENV = 'DESKTOP_AGENT_BASH';

export interface ShellInvocation {
  cmd: string;
  args: string[];
}

export function resolveShellInvocation(
  command: string,
  subprocessEnv?: Record<string, string>,
): ShellInvocation {
  if (process.platform !== 'win32') {
    return { cmd: 'bash', args: ['-lc', command] };
  }

  const bash = subprocessEnv?.[DESKTOP_AGENT_BASH_ENV] ?? process.env[DESKTOP_AGENT_BASH_ENV];
  if (bash) {
    return { cmd: bash, args: ['-lc', command] };
  }

  // ponytail: 无 bundled bash 时回退 PowerShell，避免完全不可用
  return { cmd: 'powershell.exe', args: ['-NoProfile', '-Command', command] };
}

export function formatShellOutput(stdout: string, stderr: string, code: number | null): string {
  let output = '';
  if (stdout) output += stdout;
  if (stderr) output += (output ? '\n' : '') + stderr;
  if (code !== 0 && code !== null) {
    if (!output.trim()) {
      output = `Command failed with exit code ${code} and no output.`;
      if (process.platform === 'win32') {
        output += ' The command may not exist in PATH.';
      }
    } else {
      output += `\nExit code: ${code}`;
    }
  }
  return output || '(no output)';
}
