import { describe, expect, it } from "vitest";
import {
  DefaultToolExecutor,
  ToolError,
  type Tool,
} from "@/index.js";
import { createToolContext } from "../helpers/context.js";

describe("DefaultToolExecutor", () => {
  it("runs a registered tool through the permission-aware tool boundary", async () => {
    const context = await createToolContext();
    const tool: Tool<{ value: string }, { value: string }> = {
      metadata: { name: "echo", description: "Echo", category: "general" },
      getPermissionRequirements: async () => [],
      execute: async (input) => input,
    };
    const executor = new DefaultToolExecutor([tool], context);

    await expect(
      executor.execute({
        type: "tool-call",
        id: "echo-call",
        name: "echo",
        input: { value: "hello" },
      }),
    ).resolves.toEqual({
      role: "tool",
      toolCallId: "echo-call",
      content: { value: "hello" },
    });
  });

  it("converts expected tool failures into structured error messages", async () => {
    const context = await createToolContext();
    const tool: Tool<Record<string, never>, never> = {
      metadata: { name: "fail", description: "Fail", category: "general" },
      getPermissionRequirements: async () => [],
      execute: async () => {
        throw new ToolError("not found", "FILE_NOT_FOUND");
      },
    };
    const executor = new DefaultToolExecutor([tool], context);

    await expect(
      executor.execute({
        type: "tool-call",
        id: "fail-call",
        name: "fail",
        input: {},
      }),
    ).resolves.toEqual({
      role: "tool",
      toolCallId: "fail-call",
      content: { code: "FILE_NOT_FOUND", message: "not found" },
      isError: true,
    });
  });
});
