import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
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

function ToolCallRow({ toolCall }: { toolCall: ToolCall }) {
  const active = isActiveStatus(toolCall.status);
  const liveElapsed = useElapsedMs(toolCall.startedAt, active);
  const durationLabel = formatToolCallDuration(toolCall, liveElapsed);

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-[13px] leading-5 font-mono',
        active ? 'text-gray-700' : 'text-gray-400',
      )}
    >
      {active && (
        <Loader2 size={12} className="animate-spin shrink-0 text-gray-400" />
      )}
      <span className="truncate flex-1 min-w-0">
        {getToolActivityLabel(toolCall.toolName, toolCall.input)}
      </span>
      {durationLabel && (
        <span className="shrink-0 ml-2 tabular-nums text-gray-400">{durationLabel}</span>
      )}
    </div>
  );
}

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
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-600"
      >
        {showSpinner && (
          <Loader2 size={12} className="animate-spin shrink-0" />
        )}
        <span>{summary}</span>
        <ChevronDown
          size={14}
          className={cn('transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="mt-1 space-y-0.5 pl-0.5">
          {displayToolCalls.map((toolCall) => (
            <ToolCallRow key={toolCall.id} toolCall={toolCall} />
          ))}
          {isStreaming && activeCount === 0 && !waitingForModel && (
            <div className="text-[13px] text-gray-400 font-mono">…</div>
          )}
        </div>
      )}
    </div>
  );
}
