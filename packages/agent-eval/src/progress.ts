/**
 * 评测过程输出：默认打 stderr，stdout 留给最终 result JSON。
 */
import type { SDKMessage } from "@desktop-agent/agent-runtime";

/**
 * 接收单行非结构化评测进度输出的目标函数。
 */
export type ProgressSink = (line: string) => void;

/**
 * 创建进度输出器；安静模式吞掉日志以保留 stderr 和 stdout 的调用方控制权。
 */
export function createProgressSink(quiet: boolean): ProgressSink {
  if (quiet) return () => undefined;
  return (line) => {
    console.error(line);
  };
}

/**
 * 将 SDK 流事件转换为适合 stderr 的单行摘要；不应输出的事件返回空值。
 */
export function formatSdkEvent(event: SDKMessage): string | null {
  switch (event.type) {
    case "system":
      return event.subtype === "init"
        ? `[agent] init model=${event.model} tools=${event.tools.length}`
        : null;
    case "assistant": {
      const blocks = Array.isArray(event.message?.content)
        ? event.message.content
        : [];
      const texts: string[] = [];
      const tools: string[] = [];
      for (const block of blocks) {
        if (!block || typeof block !== "object") continue;
        if (
          "type" in block &&
          block.type === "text" &&
          "text" in block &&
          typeof block.text === "string"
        ) {
          texts.push(block.text);
        }
        if ("type" in block && block.type === "tool_use" && "name" in block) {
          const name = String(block.name);
          const input =
            "input" in block ? summarizeToolInput(name, block.input) : "";
          tools.push(input ? `${name}(${input})` : name);
        }
      }
      const parts = [
        texts.length > 0 ? truncate(texts.join("").trim(), 240) : "",
        tools.length > 0 ? `tools: ${tools.join(", ")}` : "",
      ].filter(Boolean);
      return parts.length > 0 ? `[agent] ${parts.join(" | ")}` : null;
    }
    case "tool_result": {
      const name = event.result.tool_name;
      const output = truncate(
        String(event.result.output ?? "")
          .replace(/\s+/g, " ")
          .trim(),
        180,
      );
      return `[tool] ${name} → ${output || "(empty)"}`;
    }
    case "result": {
      const turns = event.num_turns != null ? ` turns=${event.num_turns}` : "";
      const ms = event.duration_ms != null ? ` ${event.duration_ms}ms` : "";
      return `[agent] done subtype=${event.subtype}${turns}${ms}`;
    }
    default:
      return null;
  }
}

/**
 * 从常见工具输入抽取长度受限的高价值标识，避免把大输入写入进度日志。
 */
function summarizeToolInput(name: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const record = input as Record<string, unknown>;
  if (name === "Bash" && typeof record.command === "string")
    return truncate(record.command, 120);
  if (typeof record.file_path === "string")
    return truncate(record.file_path, 120);
  if (typeof record.path === "string") return truncate(record.path, 120);
  if (typeof record.pattern === "string") return truncate(record.pattern, 80);
  return "";
}

/**
 * 在超过上限时保留前缀并以省略号标记截断。
 */
function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}
