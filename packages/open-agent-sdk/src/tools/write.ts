/**
 * 内置 Write 工具：在工作区中创建或覆盖文本文件。
 *
 * 路径规范化由 `resolveToolPath` 统一处理；本工具只执行已通过 Engine 权限检查的写入，不自行扩大访问范围。
 */

import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { defineTool } from "./define.js";
import type { ToolContext } from "./types.js";
import { resolveToolPath } from "../utils/toolPath.js";

/**
 * Write 工具接受的文件路径与完整文本内容。
 */
interface FileWriteInput {
  file_path: string;
  content: string;
}

/**
 * 创建父目录并以 UTF-8 覆盖写入文件。
 *
 * 写操作不可并发：多个模型工具调用同时写同一目标会造成内容竞争，因此注册表明确标记为非并发安全。
 */
async function writeFileContent(
  input: FileWriteInput,
  context: ToolContext,
): Promise<string | { data: string; is_error?: boolean }> {
  const filePath = resolveToolPath(context.cwd, input.file_path);

  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.content, "utf-8");

    const lines = input.content.split("\n").length;
    const bytes = Buffer.byteLength(input.content, "utf-8");
    return `File written: ${filePath} (${lines} lines, ${bytes} bytes)`;
  } catch (err: any) {
    return { data: `Error writing file: ${err.message}`, is_error: true };
  }
}

/**
 * 写入或创建工作区文件的非只读工具定义。
 *
 * Engine 会先调用权限回调；调用成功后返回行数与字节数，供模型确认副作用范围。
 */
export const FileWriteTool = defineTool({
  name: "Write",
  description:
    "Write content to a file. Creates the file if it does not exist, or overwrites if it does. Creates parent directories as needed.",
  inputSchema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description:
          "Path to write (prefer workspace-relative, e.g. output/a.json). Absolute Windows or Git Bash /d/... paths also work.",
      },
      content: {
        type: "string",
        description: "The content to write to the file",
      },
    },
    required: ["file_path", "content"],
  },
  isReadOnly: false,
  isConcurrencySafe: false,
  call: writeFileContent,
});
