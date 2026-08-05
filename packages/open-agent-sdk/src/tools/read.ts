/**
 * 内置 Read 工具：读取工作区文件并附带稳定行号。
 *
 * 图像等非文本文件不会读入内容；本工具只负责只读访问，路径权限仍由 Engine 的授权回调决定。
 */

import { readFile, stat } from "fs/promises";
import { defineTool } from "./types.js";
import { resolveToolPath } from "../utils/toolPath.js";
import type { ToolContext } from "../types.js";

/**
 * Read 工具支持的文件范围参数。
 */
interface FileReadInput {
  file_path: string;
  offset?: number;
  limit?: number;
}

/**
 * 读取文本文件并以一基行号格式化指定片段。
 *
 * 默认最多返回 2000 行，以限制工具结果进入模型上下文的体积；超出部分明确报告而不是静默截断。
 */
async function readFileContent(
  input: FileReadInput,
  context: ToolContext,
): Promise<string | { data: string; is_error?: boolean }> {
  const filePath = resolveToolPath(context.cwd, input.file_path);

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      return {
        data: `Error: ${filePath} is a directory, not a file. Use Bash with 'ls' to list directory contents.`,
        is_error: true,
      };
    }

    const ext = filePath.split(".").pop()?.toLowerCase();
    if (
      ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext || "")
    ) {
      return `[Image file: ${filePath} (${fileStat.size} bytes)]`;
    }

    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");
    const offset = input.offset || 0;
    const limit = input.limit || 2000;
    const selectedLines = lines.slice(offset, offset + limit);
    const numbered = selectedLines
      .map((line: string, index: number) => `${offset + index + 1}\t${line}`)
      .join("\n");
    let result = numbered;
    if (lines.length > offset + limit)
      result += `\n\n(${lines.length - offset - limit} more lines not shown)`;
    return result || "(empty file)";
  } catch (err: any) {
    if (err.code === "ENOENT")
      return { data: `Error: File not found: ${filePath}`, is_error: true };
    return { data: `Error reading file: ${err.message}`, is_error: true };
  }
}

/**
 * 读取文件内容的只读且可并发工具定义。
 */
export const FileReadTool = defineTool({
  name: "Read",
  description:
    "Read a file from the filesystem. Returns content with line numbers. Supports text files, images (returns visual content), and PDFs.",
  inputSchema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description:
          "Path to the file (prefer workspace-relative, e.g. input/a.csv). Absolute Windows or Git Bash /d/... paths also work.",
      },
      offset: {
        type: "number",
        description: "Line number to start reading from (0-based)",
      },
      limit: {
        type: "number",
        description: "Maximum number of lines to read",
      },
    },
    required: ["file_path"],
  },
  isReadOnly: true,
  isConcurrencySafe: true,
  call: readFileContent,
});
