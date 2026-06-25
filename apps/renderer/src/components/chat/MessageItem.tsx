import { Copy, Pencil } from 'lucide-react';
import { Message } from '@/stores/chatStore';
import { MarkdownContent } from './MarkdownContent';
import { ActivityStatus } from './ActivityStatus';
import { getToolActivityLabel, summarizeCompletedTools } from '@/lib/toolActivityLabel';

interface MessageItemProps {
  message: Message;
}

export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
  };

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] group">
          <div className="px-4 py-2.5 rounded-2xl bg-[#edf3fe] text-gray-800 text-[15px] leading-relaxed">
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
          <div className="flex justify-end gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              title="复制"
            >
              <Copy size={14} />
            </button>
            <button
              type="button"
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              title="编辑"
            >
              <Pencil size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const toolCalls = message.toolCalls || [];
  const runningTools = toolCalls.filter((t) => t.status === 'running' || t.status === 'pending');
  const completedTools = toolCalls.filter((t) => t.status === 'completed');
  const showTextCursor = !!message.isStreaming && runningTools.length === 0;

  return (
    <div className="py-2">
      <MarkdownContent content={message.content} isStreaming={showTextCursor} />

      {runningTools.map((toolCall) => (
        <ActivityStatus
          key={toolCall.id}
          status="running"
          label={getToolActivityLabel(toolCall.toolName, toolCall.input)}
        />
      ))}

      {completedTools.length > 0 && runningTools.length === 0 && (
        <ActivityStatus
          status="completed"
          label={summarizeCompletedTools(completedTools)}
        />
      )}
    </div>
  );
}
