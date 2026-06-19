import { Loader2, CheckCircle, XCircle, ChevronRight } from 'lucide-react';
import { ToolCall } from '@/stores/chatStore';

interface ToolCallCardProps {
  toolCall: ToolCall;
  onClick?: () => void;
}

export function ToolCallCard({ toolCall, onClick }: ToolCallCardProps) {
  const getStatusIcon = () => {
    switch (toolCall.status) {
      case 'pending':
        return <div className="w-4 h-4 rounded-full border-2 border-gray-300" />;
      case 'running':
        return <Loader2 size={16} className="text-[var(--color-primary-500)] animate-spin" />;
      case 'completed':
        return <CheckCircle size={16} className="text-[var(--color-primary-500)]" />;
      case 'error':
        return <XCircle size={16} className="text-red-500" />;
    }
  };

  const getStatusText = () => {
    switch (toolCall.status) {
      case 'pending':
        return '等待执行';
      case 'running':
        return '执行中...';
      case 'completed':
        return '执行完成';
      case 'error':
        return '执行失败';
    }
  };

  return (
    <button
      onClick={onClick}
      className="
        w-full flex items-center gap-3 px-3 py-2 
        bg-white border border-gray-200 rounded-lg
        hover:border-[var(--color-primary-300)] hover:bg-[var(--color-primary-50)]
        transition-colors text-left
      "
    >
      {getStatusIcon()}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-700 truncate">{toolCall.toolName}</p>
        <p className="text-xs text-gray-500">{getStatusText()}</p>
      </div>
      <ChevronRight size={16} className="text-gray-400" />
    </button>
  );
}