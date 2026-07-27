import { describe, it, expect, afterEach } from 'vitest';
import { formatShellOutput, resolveShellInvocation, DESKTOP_AGENT_BASH_ENV } from '../src/tools/shell.js';

describe('resolveShellInvocation', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    delete process.env[DESKTOP_AGENT_BASH_ENV];
  });

  it('uses bash -lc on unix', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const shell = resolveShellInvocation('echo hi');
    expect(shell).toEqual({ cmd: 'bash', args: ['-lc', 'echo hi'] });
  });

  it('uses bundled bash on windows when env is set', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const bash = 'C:/git/bin/bash.exe';
    const shell = resolveShellInvocation('echo hi', { [DESKTOP_AGENT_BASH_ENV]: bash });
    expect(shell).toEqual({ cmd: bash, args: ['-lc', 'echo hi'] });
  });

  it('falls back to powershell when bash is missing on windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const shell = resolveShellInvocation('echo hi');
    expect(shell.cmd).toBe('powershell.exe');
  });
});

describe('formatShellOutput', () => {
  it('marks empty failure output with a hint', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const output = formatShellOutput('', '', 1);
    expect(output).toContain('exit code 1');
    expect(output).toContain('PATH');
  });
});
