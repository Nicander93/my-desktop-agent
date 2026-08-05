/** 覆盖评测 SDK 事件到 CLI 进度文本的格式化，不执行真实 Agent。 */
import { describe, expect, it } from "vitest";
import { formatSdkEvent } from "../src/progress.js";

describe("formatSdkEvent", () => {
  it("formats assistant tool calls and text", () => {
    const line = formatSdkEvent({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "I will inspect the filter." },
          {
            type: "tool_use",
            id: "1",
            name: "Read",
            input: { file_path: "src/filter.js" },
          },
        ],
      },
    });
    expect(line).toContain("[agent]");
    expect(line).toContain("I will inspect the filter.");
    expect(line).toContain("Read(src/filter.js)");
  });

  it("formats tool results and final result", () => {
    expect(
      formatSdkEvent({
        type: "tool_result",
        result: { tool_use_id: "1", tool_name: "Bash", output: "ok\npassed" },
      }),
    ).toBe("[tool] Bash → ok passed");

    expect(
      formatSdkEvent({
        type: "result",
        subtype: "success",
        num_turns: 3,
        duration_ms: 1200,
      }),
    ).toBe("[agent] done subtype=success turns=3 1200ms");
  });
});
