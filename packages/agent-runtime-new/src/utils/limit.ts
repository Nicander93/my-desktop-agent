import { ToolError } from "@/core/errors.js";
import type { ToolContext } from "@/core/tool-context.js";

/**
 * Accepts smaller caller limits but never exceeds the runtime-owned ceiling.
 */
export function resolveSearchLimit(
  limit: number | undefined,
  context: ToolContext,
): number {
  const resolved = limit ?? context.limits.defaultSearchLimit;
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new ToolError(
      `limit must be a positive integer, got ${resolved}`,
      "INVALID_LIMIT",
    );
  }
  return Math.min(resolved, context.limits.maxSearchLimit);
}
