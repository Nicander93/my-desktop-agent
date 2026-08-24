import { describe, expect, it } from "vitest";
import { runTool, writeTool } from "@/index.js";
import { createToolContext } from "../../../helpers/context.js";

describe("writeTool", () => {
  it("reports the relative path, creation state, and written byte count", async () => {
    const context = await createToolContext();

    const result = await runTool(
      writeTool,
      { path: "notes/example.txt", content: "one\ntwo\nthree" },
      context,
    );

    expect(result).toEqual({
      path: "notes/example.txt",
      created: true,
      bytes: 13,
    });
  });
});
