import { Copy, Pencil } from 'lucide-react';
import { Message } from '@/stores/chatStore';
import { ToolCallCard } from './ToolCallCard';

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

  return (
    <div className="py-2">
      <div className="text-[15px] leading-7 text-gray-800 whitespace-pre-wrap">
        {message.content}
        {message.isStreaming && (
          <span className="inline-block w-2 h-4 ml-0.5 bg-gray-400 animate-pulse align-middle" />
        )}
      </div>

      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mt-4 space-y-2">
          {message.toolCalls.map((toolCall) => (
            <ToolCallCard key={toolCall.id} toolCall={toolCall} />
          ))}
        </div>
      )}
    </div>
  );
}
