import { useMemo } from 'react';
import { Copy, Loader2, Wrench } from 'lucide-react';
import type { AgentTrace } from '@desktop-agent/shared';
import { useChatStore } from '@/stores/chatStore';
import { TraceTimeline } from '@/features/chat/TraceSection';
import {
  formatTraceSummaryLabel,
  getTraceRunFromAgentTrace,
  getTraceSummary,
  isTraceActive,
} from '@/lib/traceUtils';

function getActiveTrace(messages: ReturnType<typeof useChatStore.getState>['messages']): AgentTrace | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const trace = messages[i].trace;
    if (trace && trace.spans.length > 0) {
      return trace;
    }
  }
  return null;
}

export function TracePanel() {
  const messages = useChatStore((s) => s.messages);
  const isProcessing = useChatStore((s) => s.isProcessing);
  const trace = useMemo(() => getActiveTrace(messages), [messages]);
  const summary = useMemo(() => (trace ? getTraceSummary(trace) : null), [trace]);
  const isLive = isTraceActive(trace, isProcessing);

  if (!trace) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <Wrench size={40} className="text-gray-300 mb-3" />
        <p className="text-sm text-gray-500">暂无 Agent Trace</p>
        <p className="text-xs text-gray-400 mt-1">Agent 执行任务后会在这里显示详细追踪</p>
      </div>
    );
  }

  const label = summary
    ? formatTraceSummaryLabel(summary, isLive)
    : `${trace.spans.length} 条记录`;

  const handleCopy = async () => {
    const run = getTraceRunFromAgentTrace(trace);
    await navigator.clipboard.writeText(JSON.stringify(run ?? trace, null, 2));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-sidebar-border)] bg-indigo-50/40">
        {isLive ? (
          <Loader2 size={14} className="animate-spin flex-shrink-0 text-indigo-400" />
        ) : (
          <Wrench size={14} className="flex-shrink-0 text-indigo-500" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-indigo-800">Agent Trace</div>
          <div className="text-[12px] text-indigo-600/80 truncate">{label}</div>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-white/80"
          title="复制 JSON"
        >
          <Copy size={14} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        <TraceTimeline trace={{ ...trace, isLive }} />
      </div>
    </div>
  );
}
