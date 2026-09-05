import type { Tool } from "@/core/tool.js";
import { editTool } from "@/tools/general/edit/edit-tool.js";
import { globTool } from "@/tools/general/glob/glob-tool.js";
import { grepTool } from "@/tools/general/grep/grep-tool.js";
import { readTool } from "@/tools/general/read/read-tool.js";
import { writeTool } from "@/tools/general/write/write-tool.js";

/**
 * Erases input and output types only at the heterogeneous registry boundary.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = Tool<any, any>;

export const generalTools: readonly AnyTool[] = [
  readTool,
  writeTool,
  editTool,
  globTool,
  grepTool,
];

/**
 * Uses last-write-wins semantics when multiple tools share a metadata name.
 */
export function createToolRegistry(
  tools: readonly AnyTool[] = generalTools,
): Map<string, AnyTool> {
  return new Map(tools.map((tool) => [tool.definition.name, tool]));
}
