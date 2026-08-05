/**
 * 工具活动汇总：探索/编辑计数、耗时与等待模型文案
 */
import type { ToolCall } from "@/stores/chatStore";
import { formatTraceDuration } from "@/lib/traceUtils";

/** 归入“探索”计数的只读工具集合。 */
const EXPLORE_TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
]);
/** 归入“编辑”计数的会改变工作区的工具集合。 */
const EDIT_TOOLS = new Set(["Write", "Edit"]);

/** 判断工具是否仍处于等待或运行状态，二者均应展示实时耗时。 */
function isActiveStatus(status: ToolCall["status"]): boolean {
  return status === "running" || status === "pending";
}

/** 汇总已有 duration 的工具耗时；活跃工具由调用方使用实时计时补充。 */
export function sumCompletedToolDurationMs(toolCalls: ToolCall[]): number {
  return toolCalls.reduce((acc, tc) => acc + (tc.durationMs ?? 0), 0);
}

/** 返回最新活动工具，以便摘要优先显示用户当前在等待的操作。 */
export function getActiveTool(toolCalls: ToolCall[]): ToolCall | undefined {
  for (let i = toolCalls.length - 1; i >= 0; i -= 1) {
    if (isActiveStatus(toolCalls[i]!.status)) return toolCalls[i];
  }
  return undefined;
}

/** 工具组外部计时状态，区分工具执行和工具结束后等待模型。 */
export interface ToolActivitySummaryTiming {
  activeElapsedMs?: number;
  modelWaitElapsedMs?: number;
  waitingForModel?: boolean;
}

/** 构造工具组汇总文案，并按活跃工具、模型等待、完成耗时的优先级追加时间。 */
export function buildToolActivitySummaryLabel(
  toolCalls: ToolCall[],
  timing: ToolActivitySummaryTiming = {},
): string {
  const summary = summarizeToolActivity(toolCalls);
  if (!summary) return "";

  const activeTool = getActiveTool(toolCalls);
  if (activeTool && timing.activeElapsedMs != null) {
    return `${summary} · ${formatTraceDuration(timing.activeElapsedMs)}…`;
  }

  if (timing.waitingForModel && timing.modelWaitElapsedMs != null) {
    return `${summary} · 等待模型 ${formatTraceDuration(timing.modelWaitElapsedMs)}…`;
  }

  const totalDuration = sumCompletedToolDurationMs(toolCalls);
  if (totalDuration > 0 && !activeTool) {
    return `${summary} · ${formatTraceDuration(totalDuration)}`;
  }

  return summary;
}

/** 格式化单条工具耗时；活跃工具只在外部提供实时计时时显示。 */
export function formatToolCallDuration(
  toolCall: ToolCall,
  liveElapsedMs?: number,
): string | undefined {
  if (isActiveStatus(toolCall.status)) {
    if (liveElapsedMs == null) return undefined;
    return `${formatTraceDuration(liveElapsedMs)}…`;
  }
  if (toolCall.durationMs != null && toolCall.durationMs > 0) {
    return formatTraceDuration(toolCall.durationMs);
  }
  return undefined;
}

/** 将工具调用归并为探索、编辑和命令三类，pending 不计入已发生动作。 */
export function summarizeToolActivityGroups(toolCalls: ToolCall[]): string[] {
  let explored = 0;
  let edited = 0;
  let commands = 0;

  for (const toolCall of toolCalls) {
    if (toolCall.status === "pending") continue;
    if (EXPLORE_TOOLS.has(toolCall.toolName)) explored += 1;
    else if (EDIT_TOOLS.has(toolCall.toolName)) edited += 1;
    else if (toolCall.toolName === "Bash") commands += 1;
  }

  const lines: string[] = [];
  if (explored > 0) {
    lines.push(`Explored ${explored} file${explored > 1 ? "s" : ""}`);
  }
  if (edited > 0) {
    lines.push(`Edited ${edited} file${edited > 1 ? "s" : ""}`);
  }
  if (commands > 0) {
    lines.push(`ran ${commands} command${commands > 1 ? "s" : ""}`);
  }

  return lines;
}

/** 生成工具活动的紧凑单行摘要，无已识别类别时回退为动作总数。 */
export function summarizeToolActivity(toolCalls: ToolCall[]): string {
  const groups = summarizeToolActivityGroups(toolCalls);
  if (groups.length > 0) return groups.join(", ");
  if (toolCalls.length === 0) return "";
  return `${toolCalls.length} actions`;
}

/** 用思考区块使用的短格式展示耗时，小于一秒不显示精确抖动。 */
export function formatThoughtDuration(ms?: number): string {
  if (!ms || ms < 1000) return "<1s";
  return `${Math.round(ms / 1000)}s`;
}

/** 提取最后一个非空思考行作为折叠态预览。 */
export function getThinkingPreview(content: string): string {
  const lines = content.trim().split("\n").filter(Boolean);
  return lines[lines.length - 1] ?? "";
}
