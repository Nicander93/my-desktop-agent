import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach } from "vitest";
import { DEFAULT_TOOL_LIMITS, type ToolContext } from "@/index.js";

const temporaryDirectories: string[] = [];

export async function createToolContext(): Promise<ToolContext> {
  const workspaceRoot = await mkdtemp(
    path.join(tmpdir(), "agent-runtime-new-"),
  );
  temporaryDirectories.push(workspaceRoot);
  return { workspaceRoot, limits: DEFAULT_TOOL_LIMITS };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
