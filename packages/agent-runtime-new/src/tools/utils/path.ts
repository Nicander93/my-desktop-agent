import path from "node:path";
import { PathScopeError } from "@/core/errors.js";
import type { ToolContext } from "@/core/tool-context.js";

/**
 * Resolves against the workspace and rejects lexical escapes unless the file policy explicitly allows them.
 */
export function resolveToolPath(
  inputPath: string | undefined,
  context: ToolContext,
): string {
  const root = path.resolve(context.workspaceRoot);
  const resolved = path.resolve(root, inputPath ?? ".");

  if (context.filePolicy?.allowOutsideWorkspace) {
    return resolved;
  }

  const relative = path.relative(root, resolved);
  const escapesRoot =
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative);
  if (escapesRoot) {
    throw new PathScopeError(resolved);
  }

  return resolved;
}

export function toWorkspaceRelative(
  absolutePath: string,
  context: ToolContext,
): string {
  const relative = path.relative(
    path.resolve(context.workspaceRoot),
    path.resolve(absolutePath),
  );
  return relative.split(path.sep).join("/") || ".";
}

export function searchOutputPathToWorkspace(
  outputPath: string,
  searchCwd: string,
  context: ToolContext,
): string {
  return toWorkspaceRelative(path.resolve(searchCwd, outputPath), context);
}
