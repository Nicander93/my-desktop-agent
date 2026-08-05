/**
 * 内置 Grep 工具：在工作区文件中执行正则内容搜索。
 *
 * 优先使用 ripgrep，缺失或失败时回退 grep；结果和运行时间均受上限控制，防止单次搜索耗尽 Agent 上下文或阻塞回合。
 */

import { spawn } from "child_process";
import { defineTool } from "./types.js";
import { resolveToolPath } from "../utils/toolPath.js";

/**
 * 只读且可并发的正则搜索工具定义。
 *
 * 路径、glob 和 file type 只用于缩小搜索范围；调用前的工作区权限仍由 Engine 统一验证。
 */
export const GrepTool = defineTool({
  name: "Grep",
  description:
    "Search file contents using regex patterns. Uses ripgrep (rg) if available, falls back to grep. Supports file type filtering and context lines.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "The regex pattern to search for",
      },
      path: {
        type: "string",
        description: "File or directory to search in (defaults to cwd)",
      },
      glob: {
        type: "string",
        description:
          'Glob pattern to filter files (e.g., "*.ts", "*.{js,jsx}")',
      },
      type: {
        type: "string",
        description: 'File type filter (e.g., "ts", "py", "js")',
      },
      output_mode: {
        type: "string",
        enum: ["content", "files_with_matches", "count"],
        description: "Output mode (default: files_with_matches)",
      },
      "-i": {
        type: "boolean",
        description: "Case insensitive search",
      },
      "-n": {
        type: "boolean",
        description: "Show line numbers (default: true)",
      },
      "-A": { type: "number", description: "Lines after match" },
      "-B": { type: "number", description: "Lines before match" },
      "-C": { type: "number", description: "Context lines" },
      context: { type: "number", description: "Context lines (alias for -C)" },
      head_limit: {
        type: "number",
        description: "Limit output entries (default: 250)",
      },
    },
    required: ["pattern"],
  },
  isReadOnly: true,
  isConcurrencySafe: true,
  /**
   * 搜索工作目录文本内容，并以受限长度返回可定位的匹配结果。
   */
  async call(input, context) {
    const searchPath = input.path
      ? resolveToolPath(context.cwd, input.path)
      : context.cwd;
    const outputMode = input.output_mode || "files_with_matches";
    const headLimit = input.head_limit ?? 250;

    // ripgrep 与 grep 都通过参数数组启动，不能将模型输入拼进 shell 字符串。
    const args: string[] = [];

    // 优先使用 rg：它对大型代码库的默认递归和忽略规则更符合工具预期。
    let cmd = "rg";

    if (outputMode === "files_with_matches") {
      args.push("--files-with-matches");
    } else if (outputMode === "count") {
      args.push("--count");
    } else {
      // content mode
      if (input["-n"] !== false) args.push("--line-number");
    }

    if (input["-i"]) args.push("--ignore-case");
    if (input["-A"]) args.push("-A", String(input["-A"]));
    if (input["-B"]) args.push("-B", String(input["-B"]));
    const ctx = input["-C"] ?? input.context;
    if (ctx) args.push("-C", String(ctx));
    if (input.glob) args.push("--glob", input.glob);
    if (input.type) args.push("--type", input.type);

    args.push("--", input.pattern, searchPath);

    return new Promise<string>((resolvePromise) => {
      const proc = spawn(cmd, args, {
        cwd: context.cwd,
        timeout: 30000,
      });

      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];
      proc.stdout?.on("data", (d: Buffer) => chunks.push(d));
      proc.stderr?.on("data", (d: Buffer) => errChunks.push(d));

      proc.on("close", (code) => {
        let result = Buffer.concat(chunks).toString("utf-8").trim();

        if (!result && code !== 0) {
          // rg 失败或无输出时使用 grep 兼容较精简的运行时环境。
          const grepArgs = ["-r"];
          if (input["-i"]) grepArgs.push("-i");
          if (outputMode === "files_with_matches") grepArgs.push("-l");
          if (outputMode === "count") grepArgs.push("-c");
          if (outputMode === "content" && input["-n"] !== false)
            grepArgs.push("-n");
          if (input.glob) grepArgs.push("--include", input.glob);
          grepArgs.push("--", input.pattern, searchPath);

          const grepProc = spawn("grep", grepArgs, {
            cwd: context.cwd,
            timeout: 30000,
          });

          const grepChunks: Buffer[] = [];
          grepProc.stdout?.on("data", (d: Buffer) => grepChunks.push(d));
          grepProc.on("close", () => {
            const grepResult = Buffer.concat(grepChunks)
              .toString("utf-8")
              .trim();
            if (!grepResult) {
              resolvePromise(`No matches found for pattern "${input.pattern}"`);
            } else {
              // 输出上限避免大量匹配直接占满模型上下文。
              const lines = grepResult.split("\n");
              if (headLimit > 0 && lines.length > headLimit) {
                resolvePromise(
                  lines.slice(0, headLimit).join("\n") +
                    `\n... (${lines.length - headLimit} more)`,
                );
              } else {
                resolvePromise(grepResult);
              }
            }
          });
          grepProc.on("error", () => {
            resolvePromise(`No matches found for pattern "${input.pattern}"`);
          });
          return;
        }

        if (!result) {
          resolvePromise(`No matches found for pattern "${input.pattern}"`);
          return;
        }

        // 同一上限也适用于 rg 成功路径。
        const lines = result.split("\n");
        if (headLimit > 0 && lines.length > headLimit) {
          result =
            lines.slice(0, headLimit).join("\n") +
            `\n... (${lines.length - headLimit} more)`;
        }

        resolvePromise(result);
      });

      proc.on("error", () => {
        // 可执行文件缺失时直接走 grep，保持“无匹配”和“工具不可用”两类结果可区分。
        const grepArgs = ["-r", "-n", "--", input.pattern, searchPath];
        const grepProc = spawn("grep", grepArgs, {
          cwd: context.cwd,
          timeout: 30000,
        });
        const grepChunks: Buffer[] = [];
        grepProc.stdout?.on("data", (d: Buffer) => grepChunks.push(d));
        grepProc.on("close", () => {
          const grepResult = Buffer.concat(grepChunks).toString("utf-8").trim();
          resolvePromise(
            grepResult || `No matches found for pattern "${input.pattern}"`,
          );
        });
        grepProc.on("error", () => {
          resolvePromise(`Error: neither rg nor grep available`);
        });
      });
    });
  },
});
