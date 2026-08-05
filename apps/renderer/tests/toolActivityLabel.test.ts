// @vitest-environment node
/** 覆盖工具活动名称到简明 UI 标签的稳定映射。 */
import { describe, expect, it } from "vitest";
import { getToolActivityLabel } from "../src/lib/toolActivityLabel";
import { getThinkingPreview } from "../src/lib/toolActivitySummary";

describe("getToolActivityLabel", () => {
  it("formats Read with line range", () => {
    const label = getToolActivityLabel("Read", {
      file_path: "apps/renderer/src/features/chat/MessageItem.tsx",
      offset: 0,
      limit: 73,
    });
    expect(label).toBe("Read MessageItem.tsx L1-73");
  });

  it("formats WebSearch", () => {
    expect(getToolActivityLabel("WebSearch", {})).toBe("WebSearch");
    expect(getToolActivityLabel("WebSearch", { query: "test" })).toBe(
      "WebSearch test",
    );
  });
});

describe("getThinkingPreview", () => {
  it("returns last non-empty line", () => {
    expect(getThinkingPreview("???\n???")).toBe("???");
  });
});
