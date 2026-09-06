import { describe, expect, it } from "vitest";
import { PathScopeError } from "@/index.js";
import { resolveToolPath } from "@/tools/utils/path.js";
import { createToolContext } from "../helpers/context.js";

describe("resolveToolPath", () => {
  it("rejects paths that resolve outside the workspace", async () => {
    const context = await createToolContext();

    expect(() => resolveToolPath("../outside.txt", context)).toThrow(
      PathScopeError,
    );
  });
});
