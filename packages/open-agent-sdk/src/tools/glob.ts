/**
 * 内置 Glob 工具：在工作区指定目录中按模式列举文件。
 *
 * 优先使用 Node 的 glob 实现；旧运行时回退到受限 shell 命令，结果始终限制为 500 条以控制上下文体积。
 */

import { defineTool } from "./define.js";
import { resolveToolPath } from "../utils/toolPath.js";

/**
 * 只读且可并发的文件模式匹配工具定义。
 *
 * 搜索根由 cwd 或经路径解析后的 `path` 决定；Engine 在调用前负责确认该目录的访问权限。
 */
export const GlobTool = defineTool({
  name: "Glob",
  description:
    'Find files matching a glob pattern. Returns matching file paths sorted by modification time. Supports patterns like "**/*.ts", "src/**/*.js".',
  inputSchema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "The glob pattern to match files against",
      },
      path: {
        type: "string",
        description: "The directory to search in (defaults to cwd)",
      },
    },
    required: ["pattern"],
  },
  isReadOnly: true,
  isConcurrencySafe: true,

  // 实际调用
  async call(input, context) {
    const searchDir = input.path
      ? resolveToolPath(context.cwd, input.path)
      : context.cwd;
    const { pattern } = input;
    try {
      // Node 22 的 glob 可避免启动 shell
      const { glob } = await import("fs/promises");

      // @ts-ignore - glob is available in Node 22+
      if (typeof glob === "function") {
        const matches: string[] = [];
        // @ts-ignore
        for await (const entry of glob(pattern, { cwd: searchDir })) {
          matches.push(entry);
          if (matches.length >= 500) break;
        }
        if (matches.length === 0) {
          return `No files matching pattern "${pattern}" in ${searchDir}`;
        }
        return matches.join("\n");
      }
    } catch {
      // 兼容较旧 bundled Node，继续使用下方 shell 回退。
    }

    // 回退命令固定限制结果数量和超时，不能将无限输出送入模型上下文。
    const { spawn } = await import("child_process");
    const { resolveShellInvocation } = await import("./shell.js");
    const command = `shopt -s globstar nullglob 2>/dev/null; cd ${JSON.stringify(searchDir)} && ls -1d ${pattern} 2>/dev/null | head -500`;
    const shell = resolveShellInvocation(command);

    return new Promise<string>((resolvePromise) => {
      const proc = spawn(shell.cmd, shell.args, {
        cwd: searchDir,
        timeout: 30000,
        env: { ...process.env },
      });

      const chunks: Buffer[] = [];
      proc.stdout?.on("data", (d: Buffer) => chunks.push(d));
      proc.on("close", () => {
        const result = Buffer.concat(chunks).toString("utf-8").trim();
        if (!result) {
          resolvePromise(
            `No files matching pattern "${pattern}" in ${searchDir}`,
          );
        } else {
          resolvePromise(result);
        }
      });
      proc.on("error", () => {
        resolvePromise(`Error searching for files with pattern "${pattern}"`);
      });
    });
  },
});
