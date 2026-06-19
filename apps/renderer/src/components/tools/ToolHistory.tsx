import { Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';

export function ToolHistory() {
  const { messages } = useChatStore();
  
  const allToolCalls = messages
    .flatMap(m => m.toolCalls || [])
    .sort((a, b) => b.id.localeCompare(a.id));

  if (allToolCalls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <Clock size={48} className="text-gray-300 mb-3" />
        <p className="text-sm text-gray-500">暂无调用历史</p>
        <p className="text-xs text-gray-400 mt-1">Agent 执行工具后会在这里显示</p>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={14} className="text-[var(--color-primary-500)]" />;
      case 'error':
        return <XCircle size={14} className="text-red-500" />;
      case 'running':
        return <Loader2 size={14} className="text-[var(--color-primary-500)] animate-spin" />;
      default:
        return <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300" />;
    }
  };

  return (
    <div className="p-3 space-y-2">
      {allToolCalls.map((toolCall) => (
        <div
          key={toolCall.id}
          className="p-3 bg-white rounded-lg border border-gray-200 hover:border-[var(--color-primary-300)] transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            {getStatusIcon(toolCall.status)}
            <span className="text-sm font-medium text-gray-700">{toolCall.toolName}</span>
          </div>
          <p className="text-xs text-gray-500 truncate">
            {typeof toolCall.input === 'string' 
              ? toolCall.input 
              : JSON.stringify(toolCall.input).slice(0, 50)}
          </p>
        </div>
      ))}
    </div>
  );
}