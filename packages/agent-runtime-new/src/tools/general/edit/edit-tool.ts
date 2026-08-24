import { ToolError } from "@/core/errors.js";
import type { Tool } from "@/core/tool.js";
import { atomicWriteTextFile, readTextFile } from "@/utils/file.js";
import { resolveToolPath, toWorkspaceRelative } from "@/utils/path.js";

export interface EditInput {
  path: string;
  oldText: string;
  newText: string;
  /**
   * Defaults to false, in which case `oldText` must match exactly once.
   */
  replaceAll?: boolean;
}

export interface EditOutput {
  path: string;
  replacements: number;
  bytesBefore: number;
  bytesAfter: number;
}

function countOccurrences(content: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = content.indexOf(needle, offset);
    if (index === -1) return count;
    count += 1;
    offset = index + needle.length;
  }
}

export const editTool: Tool<EditInput, EditOutput> = {
  metadata: {
    name: "edit",
    category: "general",
    description:
      "Replace an exact text fragment in an existing UTF-8 text file.",
  },

  async getPermissionRequirements(input, context) {
    const filePath = resolveToolPath(input.path, context);
    return [
      {
        kind: "filesystem.read",
        resource: filePath,
        reason: "Locate exact text to edit",
      },
      {
        kind: "filesystem.write",
        resource: filePath,
        reason: "Persist edited file contents",
      },
    ];
  },

  async execute(input, context) {
    if (input.oldText.length === 0) {
      throw new ToolError("oldText must not be empty.", "INVALID_EDIT");
    }

    const filePath = resolveToolPath(input.path, context);
    const content = await readTextFile(
      filePath,
      context.limits.maxTextFileBytes,
    );
    const occurrences = countOccurrences(content, input.oldText);

    if (occurrences === 0) {
      throw new ToolError(
        "oldText was not found in the target file.",
        "EDIT_NOT_FOUND",
      );
    }
    if (!input.replaceAll && occurrences !== 1) {
      throw new ToolError(
        `oldText matched ${occurrences} locations; provide a more specific fragment or set replaceAll=true.`,
        "EDIT_AMBIGUOUS",
      );
    }

    const updated = input.replaceAll
      ? content.split(input.oldText).join(input.newText)
      : content.replace(input.oldText, input.newText);

    await atomicWriteTextFile(filePath, updated);

    return {
      path: toWorkspaceRelative(filePath, context),
      replacements: input.replaceAll ? occurrences : 1,
      bytesBefore: Buffer.byteLength(content, "utf8"),
      bytesAfter: Buffer.byteLength(updated, "utf8"),
    };
  },
};
