/** 当前会话全部工具调用历史列表 */
import { Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { getToolActivityLabel } from '@/lib/toolActivityLabel';

/** 工具调用历史 */
export function ToolHistory() {
  const { messages } = useChatStore();

  const allToolCalls = messages
    .flatMap(m => m.toolCalls || [])
    .sort((a, b) => b.id.localeCompare(a.id));

  if (allToolCalls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
        <Clock size={40} className="text-[var(--color-text-muted)] mb-3" />
        <p className="text-sm text-[var(--color-text-secondary)]">暂无调用历史</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">Agent 执行工具后会在这里显示</p>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={14} className="text-[var(--color-success)]" />;
      case 'error':
        return <XCircle size={14} className="text-[var(--color-danger)]" />;
      case 'running':
        return <Loader2 size={14} className="text-[var(--color-info)] animate-spin" />;
      default:
        return <div className="w-3.5 h-3.5 rounded-full border-2 border-[var(--color-border-strong)]" />;
    }
  };

  return (
    <div className="p-3 pt-0 space-y-2">
      {allToolCalls.map((toolCall) => (
        <div
          key={toolCall.id}
          className="p-3 bg-[var(--color-bg-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-300)] transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            {getStatusIcon(toolCall.status)}
            <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
              {getToolActivityLabel(toolCall.toolName, toolCall.input)}
            </span>
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] truncate">
            {typeof toolCall.input === 'string'
              ? toolCall.input
              : JSON.stringify(toolCall.input).slice(0, 50)}
          </p>
        </div>
      ))}
    </div>
  );
}
