import { type MouseEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Brain,
  ChevronRight,
  ChevronsUp,
  Copy,
  Loader2,
  Maximize2,
  Wrench,
  Zap,
} from 'lucide-react';
import type {
  AgentTrace,
  LlmRequestPayload,
  LlmResponsePayload,
  TraceSpan,
  TraceTurn,
} from '@desktop-agent/shared';
import {
  formatTraceDuration,
  formatTraceSummaryLabel,
  formatTraceTime,
  getSpanTypeLabel,
  getTraceRunFromAgentTrace,
  getTraceSummary,
} from '@/lib/traceUtils';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LlmRequestDetail } from './trace/LlmRequestDetail';
import { LlmResponseDetail } from './trace/LlmResponseDetail';
import { ToolSpanDetail } from './trace/ToolSpanDetail';
import { TraceRawToggle } from './trace/TraceRawToggle';

interface TraceSectionProps {
  trace: AgentTrace;
}

function SpanDetail({ span }: { span: TraceSpan }) {
  const payload = span.payload;
  const toolName =
    span.type === 'tool_call' || span.type === 'tool_result'
      ? (payload as { name?: string })?.name
      : undefined;
  const model =
    span.type === 'llm_request' ? (payload as { model?: string })?.model : undefined;

  return (
    <div className="rounded-md border border-gray-100 bg-gray-50/80 p-3 text-[12px]">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-gray-500">
        <span className="font-medium text-gray-700">{getSpanTypeLabel(span.type)}</span>
        {model && <Badge variant="secondary">{model}</Badge>}
        {toolName && <Badge variant="outline">{toolName}</Badge>}
        {span.durationMs != null && (
          <span>{formatTraceDuration(span.durationMs)}</span>
        )}
      </div>
      {payload != null && (
        <TraceRawToggle payload={payload}>
          {span.type === 'llm_request' && (
            <LlmRequestDetail payload={payload as LlmRequestPayload} />
          )}
          {span.type === 'llm_response' && (
            <LlmResponseDetail payload={payload as LlmResponsePayload} />
          )}
          {(span.type === 'tool_call' || span.type === 'tool_result') && (
            <ToolSpanDetail span={span} />
          )}
        </TraceRawToggle>
      )}
    </div>
  );
}

function TurnBlock({
  turn,
  open,
  onOpenChange,
}: {
  turn: TraceTurn;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toolCount = turn.toolCalls.length;
  const llmDuration = turn.llmResponse?.durationMs;
  const startedAt = formatTraceTime(turn.startedAt);

  /** 复制当前轮次的完整结构化 trace，便于排查单轮问题。 */
  const handleCopyTurn = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    await navigator.clipboard.writeText(JSON.stringify(turn, null, 2));
  };

  return (
    <div className="relative pl-5">
      <div className="absolute bottom-0 left-[7px] top-0 w-px bg-gray-200" />
      <div className="absolute left-0 top-2 h-3.5 w-3.5 rounded-full border-2 border-white bg-indigo-400 shadow-sm" />

      <div className="flex w-full items-center gap-2">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-[13px] text-gray-700 hover:text-gray-900"
        >
          <ChevronRight
            size={14}
            className={cn('flex-shrink-0 text-gray-400 transition-transform', open && 'rotate-90')}
          />
          <span className="font-medium">Turn {turn.turn}</span>
          {startedAt && (
            <span className="text-gray-400">{startedAt}</span>
          )}
          {llmDuration != null && (
            <span className="text-gray-400">{formatTraceDuration(llmDuration)}</span>
          )}
          {toolCount > 0 && (
            <span className="text-gray-400">{toolCount} 工具</span>
          )}
        </button>
        <button
          type="button"
          onClick={handleCopyTurn}
          className="p-1 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="复制本轮 Trace"
        >
          <Copy size={13} />
        </button>
      </div>

      {open && (
        <div className="mb-3 ml-1 space-y-2">
          {turn.llmRequest && <SpanDetail span={turn.llmRequest} />}
          {turn.llmResponse && <SpanDetail span={turn.llmResponse} />}
          {turn.toolCalls.map(({ call, result }) => (
            <div key={call.id} className="space-y-1">
              <SpanDetail span={call} />
              {result && <SpanDetail span={result} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TraceTimeline({ trace }: { trace: AgentTrace }) {
  const run = useMemo(() => getTraceRunFromAgentTrace(trace), [trace]);
  const [openTurns, setOpenTurns] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!run || !trace.isLive) return;
    const latestTurn = run.turns.at(-1)?.turn;
    if (latestTurn == null) return;
    setOpenTurns((current) => ({ ...current, [latestTurn]: true }));
  }, [run, trace.isLive]);

  if (!run) return null;

  const compactSpans = trace.spans.filter((s) => s.type === 'compact');

  const handleCollapseAll = () => {
    setOpenTurns(Object.fromEntries(run.turns.map((turn) => [turn.turn, false])));
  };

  return (
    <div className="space-y-1">
      {run.turns.length > 0 && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={handleCollapseAll}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[12px] text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="全部收缩"
          >
            <ChevronsUp size={13} />
            全部收缩
          </button>
        </div>
      )}

      {run.startSpan && (
        <div className="mb-2 rounded-md border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-[12px] text-indigo-800">
          <div className="flex items-center gap-1.5 font-medium">
            <Zap size={13} />
            开始执行
          </div>
          <div className="mt-1 truncate text-indigo-600/80">
            {(run.startSpan.payload as { model?: string })?.model}
            {' · '}
            {(run.startSpan.payload as { cwd?: string })?.cwd}
          </div>
        </div>
      )}

      {compactSpans.map((span) => (
        <div
          key={span.id}
          className="flex items-center gap-2 rounded-md border border-amber-100 bg-amber-50/60 px-3 py-1.5 text-[12px] text-amber-800"
        >
          <Brain size={13} />
          上下文压缩({(span.payload as { reason?: string })?.reason})
        </div>
      ))}

      {run.turns.map((turn, idx) => (
        <TurnBlock
          key={turn.turn}
          turn={turn}
          open={openTurns[turn.turn] ?? (trace.isLive && idx === run.turns.length - 1)}
          onOpenChange={(open) => setOpenTurns((current) => ({ ...current, [turn.turn]: open }))}
        />
      ))}

      {run.endSpan && (
        <div className={cn(
          'mt-2 rounded-md border px-3 py-2 text-[12px]',
          (run.endSpan.payload as { isError?: boolean })?.isError
            ? 'border-red-100 bg-red-50/60 text-red-800'
            : 'border-green-100 bg-green-50/60 text-green-800',
        )}>
          <div className="flex items-center gap-1.5 font-medium">
            {(run.endSpan.payload as { isError?: boolean })?.isError ? (
              <AlertCircle size={13} />
            ) : (
              <Zap size={13} />
            )}
            执行完成
          </div>
          <div className="mt-1 opacity-80">
            {(run.endSpan.payload as { numTurns?: number })?.numTurns} 轮
            {run.durationMs != null && ` · ${formatTraceDuration(run.durationMs)}`}
          </div>
        </div>
      )}
    </div>
  );
}

export function TraceSection({ trace }: TraceSectionProps) {
  const [open, setOpen] = useState(!!trace.isLive);
  const [detailOpen, setDetailOpen] = useState(false);
  const summary = useMemo(() => getTraceSummary(trace), [trace]);

  useEffect(() => {
    if (trace.isLive) setOpen(true);
  }, [trace.isLive]);

  if (trace.spans.length === 0) return null;

  const label = summary
    ? formatTraceSummaryLabel(summary, trace.isLive)
    : `${trace.spans.length} 条记录`;

  const handleCopy = async () => {
    const run = getTraceRunFromAgentTrace(trace);
    await navigator.clipboard.writeText(JSON.stringify(run ?? trace, null, 2));
  };

  return (
    <>
      <div className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-indigo-700 transition-colors hover:text-indigo-900"
          >
            {trace.isLive ? (
              <Loader2 size={13} className="flex-shrink-0 animate-spin text-indigo-400" />
            ) : (
              <ChevronRight
                size={14}
                className={cn('flex-shrink-0 text-gray-400 transition-transform', open && 'rotate-90')}
              />
            )}
            <Wrench size={13} className="flex-shrink-0 text-indigo-500" />
            <span className="truncate font-medium">Agent Trace</span>
            <span className="truncate text-indigo-500/80">{label}</span>
          </button>

          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="p-1 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="全屏查看"
          >
            <Maximize2 size={14} />
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="复制 JSON"
          >
            <Copy size={14} />
          </button>
        </div>

        {open && (
          <div className="mt-2 max-h-80 overflow-y-auto pl-1">
            <TraceTimeline trace={trace} />
          </div>
        )}
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl flex flex-col overflow-hidden p-0">
          <DialogHeader className="border-b border-gray-100 px-5 pb-3 pt-5">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Wrench size={16} className="text-gray-500" />
              Agent Trace
              <span className="text-sm font-normal text-gray-400">{label}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <TraceTimeline trace={trace} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
