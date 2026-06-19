import { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { MessageItem } from './MessageItem';

export function MessageList() {
  const { messages, isProcessing } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
        <h2 className="text-2xl font-medium text-gray-800 mb-2">有什么可以帮你的？</h2>
        <p className="text-gray-500 text-sm max-w-md">
          描述你的任务，Agent 会自动调用工具完成工作
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-8">
        {messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
