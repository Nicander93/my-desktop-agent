/** 消息内工具调用折叠列表与耗时 */
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Loader2,
  XCircle,
} from "lucide-react";
import type { TraceSpan } from "@desktop-agent/shared";
import type { ToolCall } from "@/stores/chatStore";
import { getToolActivityLabel } from "@/lib/toolActivityLabel";
import {
  buildToolActivitySummaryLabel,
  formatToolCallDuration,
  getActiveTool,
} from "@/lib/toolActivitySummary";
import {
  enrichToolCallsWithTraceDurations,
  isWaitingForModel,
} from "@/lib/toolCallSync";
import { useElapsedMs } from "@/hooks/useElapsedMs";
import { cn } from "@/lib/utils";

/**
 * 工具调用组、可选 trace 时长与流式状态。
 */
interface ToolActivityLogProps {
  toolCalls: ToolCall[];
  traceSpans?: TraceSpan[];
  isStreaming?: boolean;
}

/**
 * 判断调用是否仍处于应显示实时耗时与加载动画的生命周期阶段。
 */
function isActiveStatus(status: ToolCall["status"]): boolean {
  return status === "running" || status === "pending";
}

/**
 * 将工具调用状态映射为一致的语义颜色和图标。
 */
function StatusIcon({ status }: { status: ToolCall["status"] }) {
  switch (status) {
    case "pending":
      return (
        <Circle size={14} className="shrink-0 text-[var(--color-text-muted)]" />
      );
    case "running":
      return (
        <Loader2
          size={14}
          className="shrink-0 animate-spin text-[var(--color-info)]"
        />
      );
    case "completed":
      return (
        <CheckCircle2
          size={14}
          className="shrink-0 text-[var(--color-success)]"
        />
      );
    case "error":
      return (
        <XCircle size={14} className="shrink-0 text-[var(--color-danger)]" />
      );
  }
}

/**
 * 渲染展开日志中的单次工具调用及其实时或 trace 补全后的耗时。
 */
function ToolCallRow({ toolCall }: { toolCall: ToolCall }) {
  const active = isActiveStatus(toolCall.status);
  const liveElapsed = useElapsedMs(toolCall.startedAt, active);
  const durationLabel = formatToolCallDuration(toolCall, liveElapsed);

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13px] leading-5",
        active
          ? "bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)]"
          : "text-[var(--color-text-secondary)]",
      )}
    >
      <StatusIcon status={toolCall.status} />
      <span className="truncate flex-1 min-w-0 font-medium">
        {getToolActivityLabel(toolCall.toolName, toolCall.input)}
      </span>
      {durationLabel && (
        <span className="shrink-0 ml-2 tabular-nums text-[var(--color-text-muted)] text-xs">
          {durationLabel}
        </span>
      )}
    </div>
  );
}

/** 工具活动日志主组件 */
/**
 * 汇总一组工具调用，区分工具运行、模型等待和已完成状态，并可展开查看明细。
 */
export function ToolActivityLog({
  toolCalls,
  traceSpans,
  isStreaming,
}: ToolActivityLogProps) {
  const [open, setOpen] = useState(false);
  const displayToolCalls = useMemo(
    () => enrichToolCallsWithTraceDurations(toolCalls, traceSpans),
    [toolCalls, traceSpans],
  );
  const activeCount = displayToolCalls.filter((t) =>
    isActiveStatus(t.status),
  ).length;
  const waitingForModel = isWaitingForModel(displayToolCalls, isStreaming);
  const activeTool = getActiveTool(displayToolCalls);
  const activeElapsed = useElapsedMs(activeTool?.startedAt, !!activeTool);

  const [modelWaitStartedAt, setModelWaitStartedAt] = useState<
    number | undefined
  >();
  useEffect(() => {
    if (waitingForModel) {
      setModelWaitStartedAt((prev) => prev ?? Date.now());
    } else {
      setModelWaitStartedAt(undefined);
    }
  }, [waitingForModel]);
  const modelWaitElapsed = useElapsedMs(modelWaitStartedAt, waitingForModel);

  if (displayToolCalls.length === 0) return null;

  const summary = buildToolActivitySummaryLabel(displayToolCalls, {
    activeElapsedMs: activeElapsed,
    modelWaitElapsedMs: modelWaitElapsed,
    waitingForModel,
  });
  const showSpinner = activeCount > 0 || waitingForModel;

  return (
    <div className="mb-3 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
      >
        {showSpinner && (
          <Loader2
            size={14}
            className="animate-spin shrink-0 text-[var(--color-info)]"
          />
        )}
        {!showSpinner && (
          <CheckCircle2
            size={14}
            className="shrink-0 text-[var(--color-success)]"
          />
        )}
        <span className="flex-1 text-left truncate">{summary}</span>
        <ChevronDown
          size={14}
          className={cn("shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="space-y-0.5 border-t border-[var(--color-border-default)] px-2 py-2">
          {displayToolCalls.map((toolCall) => (
            <ToolCallRow key={toolCall.id} toolCall={toolCall} />
          ))}
          {isStreaming && activeCount === 0 && !waitingForModel && (
            <div className="px-2 py-1 text-[13px] text-[var(--color-text-muted)]">
              …
            </div>
          )}
        </div>
      )}
    </div>
  );
}
