import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { editTool, runTool } from "@/index.js";
import { createToolContext } from "../../../helpers/context.js";

describe("editTool", () => {
  it("rejects ambiguous edits unless replaceAll is explicit", async () => {
    const context = await createToolContext();
    const filePath = path.join(context.workspaceRoot, "repeat.txt");
    await writeFile(filePath, "old old", "utf8");

    await expect(
      runTool(
        editTool,
        { path: "repeat.txt", oldText: "old", newText: "new" },
        context,
      ),
    ).rejects.toMatchObject({ code: "EDIT_AMBIGUOUS" });

    const result = await runTool(
      editTool,
      { path: "repeat.txt", oldText: "old", newText: "new", replaceAll: true },
      context,
    );
    expect(result.replacements).toBe(2);
    await expect(readFile(filePath, "utf8")).resolves.toBe("new new");
  });
});
