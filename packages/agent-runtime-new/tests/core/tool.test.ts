import { describe, expect, it, vi } from "vitest";
import { runTool } from "@/index.js";
import { createToolContext } from "../helpers/context.js";

describe("runTool", () => {
  it("can't run a tool when permission is denied", async () => {
    const context = await createToolContext();
    const execute = vi.fn(async () => "executed");
    context.permissionEngine = {
      check: vi.fn(async () => ({
        allowed: false as const,
        reason: "test denial",
      })),
    };

    await expect(
      runTool(
        {
          metadata: { name: "test", description: "test", category: "general" },
          getPermissionRequirements: async () => [
            {
              kind: "filesystem.read",
              resource: context.workspaceRoot,
              reason: "test",
            },
          ],
          execute,
        },
        {},
        context,
      ),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(execute).not.toHaveBeenCalled();
  });
});
