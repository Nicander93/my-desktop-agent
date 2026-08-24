import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readTool, runTool } from "@/index.js";
import { createToolContext } from "../../../helpers/context.js";

describe("readTool", () => {
  it("returns a structured line range", async () => {
    const context = await createToolContext();
    await writeFile(
      path.join(context.workspaceRoot, "example.txt"),
      "one\ntwo\nthree",
      "utf8",
    );
    const readResult = await runTool(
      readTool,
      { path: "example.txt", offset: 2, limit: 1 },
      context,
    );

    expect(readResult).toMatchObject({
      path: "example.txt",
      content: "two",
      startLine: 2,
      endLine: 2,
      totalLines: 3,
      truncated: true,
    });
  });
});
