/** 消息内工具调用折叠列表与耗时 */
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, Circle, Loader2, XCircle } from 'lucide-react';
import type { TraceSpan } from '@desktop-agent/shared';
import type { ToolCall } from '@/stores/chatStore';
import { getToolActivityLabel } from '@/lib/toolActivityLabel';
import {
  buildToolActivitySummaryLabel,
  formatToolCallDuration,
  getActiveTool,
} from '@/lib/toolActivitySummary';
import { enrichToolCallsWithTraceDurations, isWaitingForModel } from '@/lib/toolCallSync';
import { useElapsedMs } from '@/hooks/useElapsedMs';
import { cn } from '@/lib/utils';

interface ToolActivityLogProps {
  toolCalls: ToolCall[];
  traceSpans?: TraceSpan[];
  isStreaming?: boolean;
}

function isActiveStatus(status: ToolCall['status']): boolean {
  return status === 'running' || status === 'pending';
}

function StatusIcon({ status }: { status: ToolCall['status'] }) {
  switch (status) {
    case 'pending':
      return <Circle size={14} className="shrink-0 text-[var(--color-text-muted)]" />;
    case 'running':
      return <Loader2 size={14} className="shrink-0 animate-spin text-[var(--color-info)]" />;
    case 'completed':
      return <CheckCircle2 size={14} className="shrink-0 text-[var(--color-success)]" />;
    case 'error':
      return <XCircle size={14} className="shrink-0 text-[var(--color-danger)]" />;
  }
}

function ToolCallRow({ toolCall }: { toolCall: ToolCall }) {
  const active = isActiveStatus(toolCall.status);
  const liveElapsed = useElapsedMs(toolCall.startedAt, active);
  const durationLabel = formatToolCallDuration(toolCall, liveElapsed);

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13px] leading-5',
        active ? 'bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]',
      )}
    >
      <StatusIcon status={toolCall.status} />
      <span className="truncate flex-1 min-w-0 font-medium">
        {getToolActivityLabel(toolCall.toolName, toolCall.input)}
      </span>
      {durationLabel && (
        <span className="shrink-0 ml-2 tabular-nums text-[var(--color-text-muted)] text-xs">{durationLabel}</span>
      )}
    </div>
  );
}

/** 工具活动日志主组件 */
export function ToolActivityLog({ toolCalls, traceSpans, isStreaming }: ToolActivityLogProps) {
  const [open, setOpen] = useState(false);
  const displayToolCalls = useMemo(
    () => enrichToolCallsWithTraceDurations(toolCalls, traceSpans),
    [toolCalls, traceSpans],
  );
  const activeCount = displayToolCalls.filter((t) => isActiveStatus(t.status)).length;
  const waitingForModel = isWaitingForModel(displayToolCalls, isStreaming);
  const activeTool = getActiveTool(displayToolCalls);
  const activeElapsed = useElapsedMs(activeTool?.startedAt, !!activeTool);

  const [modelWaitStartedAt, setModelWaitStartedAt] = useState<number | undefined>();
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
          <Loader2 size={14} className="animate-spin shrink-0 text-[var(--color-info)]" />
        )}
        {!showSpinner && (
          <CheckCircle2 size={14} className="shrink-0 text-[var(--color-success)]" />
        )}
        <span className="flex-1 text-left truncate">{summary}</span>
        <ChevronDown
          size={14}
          className={cn('shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="space-y-0.5 border-t border-[var(--color-border-default)] px-2 py-2">
          {displayToolCalls.map((toolCall) => (
            <ToolCallRow key={toolCall.id} toolCall={toolCall} />
          ))}
          {isStreaming && activeCount === 0 && !waitingForModel && (
            <div className="px-2 py-1 text-[13px] text-[var(--color-text-muted)]">…</div>
          )}
        </div>
      )}
    </div>
  );
}
