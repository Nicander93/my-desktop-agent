import { spawn } from "node:child_process";
import { ToolError } from "@/core/errors.js";

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunProcessOptions {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
  /**
   * Allows callers to treat tool-specific statuses such as ripgrep's no-match code as success.
   */
  allowedExitCodes?: readonly number[];
}

/**
 * Runs the process directly (no shell) to prevent injection attacks,
 * and caps both CPU time and stdout/stderr size to avoid resource exhaustion.
 */
export function runProcess(options: RunProcessOptions): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      windowsHide: true,
      // no shell
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let outputBytes = 0;
    let finished = false;

    const fail = (error: Error): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.kill();
      reject(error);
    };

    const collect = (target: Buffer[], chunk: Buffer): void => {
      outputBytes += chunk.length;
      if (outputBytes > options.maxOutputBytes) {
        fail(
          new ToolError(
            "Subprocess output exceeded the configured limit.",
            "PROCESS_OUTPUT_LIMIT",
          ),
        );
        return;
      }
      target.push(chunk);
    };

    child.stdout?.on("data", (chunk: Buffer) => collect(stdoutChunks, chunk));
    child.stderr?.on("data", (chunk: Buffer) => collect(stderrChunks, chunk));
    child.on("error", fail);

    const timer = setTimeout(() => {
      fail(
        new ToolError(
          `Subprocess timed out after ${options.timeoutMs} ms.`,
          "PROCESS_TIMEOUT",
        ),
      );
    }, options.timeoutMs);

    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);

      const exitCode = code ?? -1;
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      const allowed = options.allowedExitCodes ?? [0];

      if (!allowed.includes(exitCode)) {
        reject(
          new ToolError(
            `Command failed with exit code ${exitCode}: ${stderr.trim() || options.command}`,
            "PROCESS_FAILED",
          ),
        );
        return;
      }

      resolve({ exitCode, stdout, stderr });
    });
  });
}
