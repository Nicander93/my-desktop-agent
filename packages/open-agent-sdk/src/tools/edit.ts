/**
 * 内置 Edit 工具：对工作区文件进行精确字符串替换。
 *
 * 匹配忽略 CR/LF 差异但写回保留原文件换行风格；非唯一匹配默认拒绝，避免模型误改多个位置。
 */

import { readFile, writeFile } from "fs/promises";
import { defineTool } from "./types.js";
import { resolveToolPath } from "../utils/toolPath.js";

/**
 * 检测原文件换行风格，以便 Edit 不因局部替换制造整文件换行噪音。
 */
function detectEol(content: string): "\r\n" | "\n" {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

/**
 * 将不同换行表示归一为 LF，用于跨平台精确匹配。
 */
function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * 将归一化文本恢复为原文件的换行风格。
 */
function applyEol(value: string, eol: "\r\n" | "\n"): string {
  return eol === "\n" ? value : value.split("\n").join(eol);
}

/**
 * 非只读、非并发安全的精确替换工具定义。
 *
 * Engine 必须在执行前完成路径授权；replace_all 未显式启用时，旧字符串只能出现一次。
 */
export const FileEditTool = defineTool({
  name: "Edit",
  description:
    "Perform exact string replacements in files. The old_string must match the file content (indentation/whitespace matter; CR/LF differences are ignored). Use replace_all to change every occurrence.",
  inputSchema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description:
          "Path to the file (prefer workspace-relative). Absolute Windows or Git Bash /d/... paths also work.",
      },
      old_string: {
        type: "string",
        description: "The exact text to find and replace",
      },
      new_string: {
        type: "string",
        description: "The replacement text",
      },
      replace_all: {
        type: "boolean",
        description: "Replace all occurrences (default false)",
      },
    },
    required: ["file_path", "old_string", "new_string"],
  },
  isReadOnly: false,
  isConcurrencySafe: false,
  /**
   * 按编辑指令修改受授权路径中的文本，并返回可用于后续判断的结果摘要。
   */
  async call(input, context) {
    const filePath = resolveToolPath(context.cwd, input.file_path);
    const { old_string, new_string, replace_all } = input;

    // 先归一换行，再比较替换内容，避免仅因 Windows/Unix EOL 不同而拒绝有效编辑。
    const normalizedOld = normalizeNewlines(old_string);
    const normalizedNew = normalizeNewlines(new_string);
    if (normalizedOld === normalizedNew) {
      return {
        data: "Error: old_string and new_string are identical",
        is_error: true,
      };
    }

    try {
      const original = await readFile(filePath, "utf-8");
      const eol = detectEol(original);
      let normalizedContent = normalizeNewlines(original);

      if (!normalizedContent.includes(normalizedOld)) {
        return {
          data: `Error: old_string not found in ${filePath}. Make sure it matches exactly including whitespace.`,
          is_error: true,
        };
      }

      if (!replace_all) {
        const count = normalizedContent.split(normalizedOld).length - 1;
        if (count > 1) {
          return {
            data: `Error: old_string appears ${count} times in the file. Provide more context to make it unique, or set replace_all: true.`,
            is_error: true,
          };
        }
        normalizedContent = normalizedContent.replace(
          normalizedOld,
          normalizedNew,
        );
      } else {
        normalizedContent = normalizedContent
          .split(normalizedOld)
          .join(normalizedNew);
      }

      await writeFile(filePath, applyEol(normalizedContent, eol), "utf-8");
      return `File edited: ${filePath}`;
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return { data: `Error: File not found: ${filePath}`, is_error: true };
      }
      return { data: `Error editing file: ${err.message}`, is_error: true };
    }
  },
});
