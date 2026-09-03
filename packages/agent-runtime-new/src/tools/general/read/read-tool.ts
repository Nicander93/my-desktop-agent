import { ToolError } from "@/core/errors.js";
import type { Tool } from "@/core/tool.js";
import { readTextFile } from "@/utils/file.js";
import { resolveToolPath, toWorkspaceRelative } from "@/utils/path.js";

export interface ReadInput {
  path: string;
  /**
   * One-based start line. Defaults to 1.
   */
  offset?: number;
  /**
   * Maximum number of lines to return. Defaults to 2,000.
   */
  limit?: number;
}

export interface ReadOutput {
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new ToolError(
      `${name} must be a positive integer.`,
      "INVALID_ARGUMENT",
    );
  }
  return resolved;
}

export const readTool: Tool<ReadInput, ReadOutput> = {
  definition: {
    name: "read",
    description: "Read a UTF-8 text file, optionally selecting a line range.",
  },

  async getPermissionRequirements(input, context) {
    const filePath = resolveToolPath(input.path, context);
    return [
      {
        kind: "filesystem.read",
        resource: filePath,
        reason: "Read file contents",
      },
    ];
  },

  async execute(input, context) {
    const filePath = resolveToolPath(input.path, context);
    const content = await readTextFile(
      filePath,
      context.limits.maxTextFileBytes,
    );
    const lines = content.split(/\r?\n/);

    const startLine = positiveInteger(input.offset, 1, "offset");
    const requestedLimit = positiveInteger(input.limit, 2_000, "limit");
    const startIndex = startLine - 1;
    const selected = lines.slice(startIndex, startIndex + requestedLimit);
    const endLine =
      selected.length === 0 ? startLine - 1 : startLine + selected.length - 1;

    return {
      path: toWorkspaceRelative(filePath, context),
      content: selected.join("\n"),
      startLine,
      endLine,
      totalLines: lines.length,
      truncated: endLine < lines.length,
    };
  },
};
