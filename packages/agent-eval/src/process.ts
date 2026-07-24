import { spawn } from 'node:child_process';

const MAX_OUTPUT_CHARS = 50_000;

export interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export function runProcess(command: string, args: string[], cwd: string, timeoutMs = 60_000, signal?: AbortSignal): Promise<ProcessResult> {
  return new Promise((resolveResult, reject) => {
    const resolvedCommand = resolveCommand(command);
    const child = spawn(resolvedCommand, args, {
      cwd,
      env: { ...process.env, CI: process.env.CI ?? 'true' },
      shell: process.platform === 'win32' && /\.cmd$/i.test(resolvedCommand),
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let done = false;
    const append = (current: string, chunk: Buffer) => `${current}${chunk.toString()}`.slice(-MAX_OUTPUT_CHARS);
    const terminate = () => {
      if (!child.pid) return;
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true }).on('error', () => undefined);
      } else child.kill('SIGTERM');
    };
    const finish = (result: ProcessResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolveResult(result);
    };
    const onAbort = () => terminate();
    const timer = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout?.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.on('error', (error) => { if (!done) { done = true; clearTimeout(timer); reject(error); } });
    child.on('close', (exitCode) => finish({ exitCode, stdout, stderr, timedOut }));
  });
}

function resolveCommand(command: string): string {
  if (process.platform !== 'win32' || /\.(cmd|exe|bat)$/i.test(command)) return command;
  return ['pnpm', 'npm', 'npx'].includes(command) ? `${command}.cmd` : command;
}
