import type { Tool } from "@/core/tool.js";
import { atomicWriteTextFile, pathExists } from "@/tools/utils/file.js";
import { resolveToolPath, toWorkspaceRelative } from "@/tools/utils/path.js";

export interface WriteInput {
  path: string;
  content: string;
}

export interface WriteOutput {
  path: string;
  created: boolean;
  bytes: number;
}

export const writeTool: Tool<WriteInput, WriteOutput> = {
  definition: {
    name: "write",
    description:
      "Create or fully replace a UTF-8 text file using an atomic write.",
  },

  async getPermissionRequirements(input, context) {
    const filePath = resolveToolPath(input.path, context);
    return [
      {
        kind: "filesystem.write",
        resource: filePath,
        reason: "Create or replace file contents",
      },
    ];
  },

  async execute(input, context) {
    const filePath = resolveToolPath(input.path, context);
    const existed = await pathExists(filePath);
    await atomicWriteTextFile(filePath, input.content);

    return {
      path: toWorkspaceRelative(filePath, context),
      created: !existed,
      bytes: Buffer.byteLength(input.content, "utf8"),
    };
  },
};
