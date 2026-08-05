/**
 * BashTool - Execute shell commands (platform-aware)
 */

import { spawn } from "child_process";
import { defineTool } from "./types.js";
import { formatShellOutput, resolveShellInvocation } from "./shell.js";

const isWin32 = process.platform === "win32";

export const BashTool = defineTool({
  name: "Bash",
  description: isWin32
    ? "Execute a bash command via bundled Git Bash and return its output. Use Unix shell syntax (ls, grep, sed, python3, pipes, etc.)."
    : "Execute a bash command and return its output. Use for running shell commands, scripts, and system operations.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The bash command to execute",
      },
      timeout: {
        type: "number",
        description:
          "Optional timeout in milliseconds (max 600000, default 120000)",
      },
    },
    required: ["command"],
  },
  isReadOnly: false,
  isConcurrencySafe: false,
  /**
   * 在工具上下文指定的工作目录执行 shell 命令，并归一化 stdout、stderr 与退出码。
   */
  async call(input, context) {
    const { command, timeout: userTimeout } = input;
    const timeoutMs = Math.min(userTimeout || 120000, 600000);
    const shell = resolveShellInvocation(command, context.subprocessEnv);

    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];

      const proc = spawn(shell.cmd, shell.args, {
        cwd: context.cwd,
        env: context.subprocessEnv
          ? { ...process.env, ...context.subprocessEnv }
          : { ...process.env },
        timeout: timeoutMs,
        stdio: ["pipe", "pipe", "pipe"],
      });

      proc.stdout?.on("data", (data: Buffer) => chunks.push(data));
      proc.stderr?.on("data", (data: Buffer) => errChunks.push(data));

      if (context.abortSignal) {
        context.abortSignal.addEventListener(
          "abort",
          () => {
            proc.kill("SIGTERM");
          },
          { once: true },
        );
      }

      proc.on("close", (code) => {
        const stdout = Buffer.concat(chunks).toString("utf-8");
        const stderr = Buffer.concat(errChunks).toString("utf-8");
        const output = formatShellOutput(stdout, stderr, code);

        if (output.length > 100000) {
          const truncated =
            output.slice(0, 50000) +
            "\n...(truncated)...\n" +
            output.slice(-50000);
          resolve(
            code !== 0 && code !== null
              ? { data: truncated, is_error: true }
              : truncated,
          );
          return;
        }

        if (code !== 0 && code !== null) {
          resolve({ data: output, is_error: true });
          return;
        }
        resolve(output);
      });

      proc.on("error", (err) => {
        resolve({
          data: `Error executing command: ${err.message}`,
          is_error: true,
        });
      });
    });
  },
});
