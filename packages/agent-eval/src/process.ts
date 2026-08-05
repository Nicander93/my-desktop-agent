/**
 * 子进程执行封装；stdout/stderr 各截断 50k，超时强杀子树（Windows 用 taskkill）。
 * verifier 跑测试命令、runner 调 agent 都走这。
 */
import { spawn } from "node:child_process";

/** 单个输出流保留尾部的最大字符数，避免失败命令撑爆评测结果文件。 */
const MAX_OUTPUT_CHARS = 50_000;

/** 子进程结束后返回给 verifier/runner 的受限输出与终止状态。 */
export interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * 在指定工作目录运行命令并收集有限长度输出。
 *
 * Windows 使用 `.cmd` shim 与 taskkill 终止整个子树；AbortSignal 和 timeout 都走同一终止路径。
 */
export function runProcess(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = 60_000,
  signal?: AbortSignal,
): Promise<ProcessResult> {
  return new Promise((resolveResult, reject) => {
    const resolvedCommand = resolveCommand(command);
    const child = spawn(resolvedCommand, args, {
      cwd,
      env: { ...process.env, CI: process.env.CI ?? "true" },
      shell: process.platform === "win32" && /\.cmd$/i.test(resolvedCommand),
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let done = false;
    /** 仅保留输出尾部，通常包含最近的失败栈和断言信息。 */
    const append = (current: string, chunk: Buffer) =>
      `${current}${chunk.toString()}`.slice(-MAX_OUTPUT_CHARS);
    /** 终止进程及其后代，Windows 不能只 kill 父进程。 */
    const terminate = () => {
      if (!child.pid) return;
      if (process.platform === "win32") {
        spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          shell: false,
          windowsHide: true,
        }).on("error", () => undefined);
      } else child.kill("SIGTERM");
    };
    /** 保证 close、error、abort 竞争时只解析一次结果。 */
    const finish = (result: ProcessResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolveResult(result);
    };
    /** 将外部取消信号转发到同一子树终止逻辑。 */
    const onAbort = () => terminate();
    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.on("error", (error) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        reject(error);
      }
    });
    child.on("close", (exitCode) =>
      finish({ exitCode, stdout, stderr, timedOut }),
    );
  });
}

/** 为 Windows shell 命令补充 `.cmd`，显式后缀和非 Windows 保持不变。 */
function resolveCommand(command: string): string {
  if (process.platform !== "win32" || /\.(cmd|exe|bat)$/i.test(command))
    return command;
  return ["pnpm", "npm", "npx"].includes(command) ? `${command}.cmd` : command;
}
