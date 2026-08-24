import type { ToolContext } from "@/core/tool-context.js";

export type PermissionKind =
  | "filesystem.read"
  | "filesystem.write"
  | "process.execute";

export interface PermissionRequirement {
  kind: PermissionKind;
  resource: string;
  reason: string;
}

export type PermissionDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Keeps policy decisions outside tools; tools declare requirements without choosing an authorization mode.
 */
export interface PermissionEngine {
  check(
    requirement: PermissionRequirement,
    context: ToolContext,
  ): Promise<PermissionDecision>;
}
