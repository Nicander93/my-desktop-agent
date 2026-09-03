import { stat } from "node:fs/promises";
import { ToolError } from "@/core/errors.js";
import type { Tool } from "@/core/tool.js";
import { resolveSearchLimit } from "@/utils/limit.js";
import { resolveToolPath, searchOutputPathToWorkspace } from "@/utils/path.js";
import { runProcess } from "@/utils/process.js";

export interface GlobInput {
  pattern: string;
  /**
   * Directory to search. Defaults to the workspace root.
   */
  path?: string;
  ignore?: string[];
  /**
   * Set to false to include ignored and hidden files while still excluding `.git`.
   */
  gitignore?: boolean;
  /**
   * Defaults to `files`.
   */
  mode?: "files" | "count";
  limit?: number;
}

export type GlobOutput =
  | { mode: "files"; files: string[]; returned: number; truncated: boolean }
  | { mode: "count"; count: number };

export const globTool: Tool<GlobInput, GlobOutput> = {
  definition: {
    name: "glob",
    description:
      "Find file paths by glob pattern without reading file contents.",
  },

  async getPermissionRequirements(input, context) {
    const searchPath = resolveToolPath(input.path, context);
    return [
      {
        kind: "filesystem.read",
        resource: searchPath,
        reason: "Enumerate matching file paths",
      },
    ];
  },

  async execute(input, context) {
    const searchPath = resolveToolPath(input.path, context);
    const info = await stat(searchPath);
    if (!info.isDirectory()) {
      throw new ToolError(
        "Glob path must be a directory.",
        "GLOB_PATH_NOT_DIRECTORY",
      );
    }

    const args = [
      "--files",
      "--null",
      "--color",
      "never",
      "--glob",
      input.pattern,
    ];
    for (const ignored of input.ignore ?? []) {
      args.push("--glob", `!${ignored}`);
    }
    if (input.gitignore === false) {
      args.push("--no-ignore-vcs", "--hidden", "--glob", "!.git/**");
    }

    const result = await runProcess({
      command: context.binaries?.rg ?? "rg",
      args,
      cwd: searchPath,
      timeoutMs: context.limits.searchTimeoutMs,
      maxOutputBytes: context.limits.maxProcessOutputBytes,
      allowedExitCodes: [0, 1],
    });

    const files = result.stdout
      .split("\0")
      .filter(Boolean)
      .map((file) => searchOutputPathToWorkspace(file, searchPath, context))
      .sort();

    if ((input.mode ?? "files") === "count") {
      return { mode: "count", count: files.length };
    }

    const limit = resolveSearchLimit(input.limit, context);
    return {
      mode: "files",
      files: files.slice(0, limit),
      returned: Math.min(files.length, limit),
      truncated: files.length > limit,
    };
  },
};
