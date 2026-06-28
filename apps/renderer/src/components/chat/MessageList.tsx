import { useEffect, useMemo, useRef } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { MessageItem } from './MessageItem';

const STICKY_THRESHOLD = 80;

export function MessageList() {
  const { messages, isProcessing } = useChatStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);
  const stickToBottomRef = useRef(true);

  const scrollKey = useMemo(
    () => messages
      .map((m) => `${m.id}|${m.role}|${m.content?.length ?? 0}|${m.isStreaming ? 1 : 0}`)
      .join('\n'),
    [messages],
  );

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom <= STICKY_THRESHOLD;
  };

  useEffect(() => {
    const isNewMessage = messages.length > prevLengthRef.current;
    prevLengthRef.current = messages.length;

    if (isNewMessage || stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: isNewMessage ? 'smooth' : 'auto' });
    }
  }, [scrollKey, isProcessing, messages.length]);

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
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-8">
        {messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
