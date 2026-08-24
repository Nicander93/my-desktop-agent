import type { PermissionEngine } from "@/core/permission.js";

/**
 * Runtime-owned limits that model-provided input cannot raise.
 */
export interface ToolLimits {
  defaultSearchLimit: number;
  maxSearchLimit: number;
  maxProcessOutputBytes: number;
  maxTextFileBytes: number;
  searchTimeoutMs: number;
}

export interface FilePolicy {
  /**
   * Defaults to false so path resolution remains workspace-scoped.
   */
  allowOutsideWorkspace?: boolean;
}

export interface ToolBinaries {
  /**
   * Falls back to `rg` on PATH when omitted.
   */
  rg?: string;
}

export interface ToolContext {
  workspaceRoot: string;
  permissionEngine?: PermissionEngine;
  limits: ToolLimits;
  filePolicy?: FilePolicy;
  binaries?: ToolBinaries;
}

/**
 * Conservative defaults that callers may tighten when constructing a context.
 */
export const DEFAULT_TOOL_LIMITS: ToolLimits = {
  defaultSearchLimit: 100,
  maxSearchLimit: 1_000,
  maxProcessOutputBytes: 8 * 1024 * 1024,
  maxTextFileBytes: 4 * 1024 * 1024,
  searchTimeoutMs: 15_000,
};
