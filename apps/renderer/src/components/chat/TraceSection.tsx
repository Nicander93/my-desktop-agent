import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Copy,
  Loader2,
  Maximize2,
  Brain,
  Wrench,
  Zap,
  AlertCircle,
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
  getSpanTypeLabel,
  getTraceRunFromAgentTrace,
  getTraceSummary,
} from '@/lib/traceUtils';
import { LlmRequestDetail } from './trace/LlmRequestDetail';
import { LlmResponseDetail } from './trace/LlmResponseDetail';
import { ToolSpanDetail } from './trace/ToolSpanDetail';
import { TraceRawToggle } from './trace/TraceRawToggle';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
      <div className="flex flex-wrap items-center gap-2 mb-2 text-gray-500">
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

function TurnBlock({ turn, defaultOpen }: { turn: TraceTurn; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const toolCount = turn.toolCalls.length;
  const llmDuration = turn.llmResponse?.durationMs;

  return (
    <div className="relative pl-5">
      <div className="absolute left-[7px] top-0 bottom-0 w-px bg-gray-200" />
      <div className="absolute left-0 top-2 h-3.5 w-3.5 rounded-full border-2 border-white bg-indigo-400 shadow-sm" />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 py-1.5 text-left text-[13px] text-gray-700 hover:text-gray-900"
      >
        <ChevronRight
          size={14}
          className={cn('flex-shrink-0 text-gray-400 transition-transform', open && 'rotate-90')}
        />
        <span className="font-medium">Turn {turn.turn}</span>
        {llmDuration != null && (
          <span className="text-gray-400">{formatTraceDuration(llmDuration)}</span>
        )}
        {toolCount > 0 && (
          <span className="text-gray-400">{toolCount} 工具</span>
        )}
      </button>

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

  if (!run) return null;

  const compactSpans = trace.spans.filter((s) => s.type === 'compact');

  return (
    <div className="space-y-1">
      {run.startSpan && (
        <div className="mb-2 rounded-md border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-[12px] text-indigo-800">
          <div className="flex items-center gap-1.5 font-medium">
            <Zap size={13} />
            开始执行
          </div>
          <div className="mt-1 text-indigo-600/80 truncate">
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
          上下文压缩 ({(span.payload as { reason?: string })?.reason})
        </div>
      ))}

      {run.turns.map((turn, idx) => (
        <TurnBlock
          key={turn.turn}
          turn={turn}
          defaultOpen={trace.isLive && idx === run.turns.length - 1}
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
            className="flex flex-1 items-center gap-1.5 text-[13px] text-indigo-700 hover:text-indigo-900 transition-colors min-w-0"
          >
            {trace.isLive ? (
              <Loader2 size={13} className="animate-spin flex-shrink-0 text-indigo-400" />
            ) : (
              <ChevronRight
                size={14}
                className={cn('flex-shrink-0 text-gray-400 transition-transform', open && 'rotate-90')}
              />
            )}
            <Wrench size={13} className="flex-shrink-0 text-indigo-500" />
            <span className="truncate font-medium">Agent Trace</span>
            <span className="text-indigo-500/80 truncate">{label}</span>
          </button>

          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            title="全屏查看"
          >
            <Maximize2 size={14} />
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            title="复制 JSON"
          >
            <Copy size={14} />
          </button>
        </div>

        {open && (
          <div className="mt-2 pl-1 max-h-80 overflow-y-auto">
            <TraceTimeline trace={trace} />
          </div>
        )}
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-gray-100">
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
