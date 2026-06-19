import { useState, useRef, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { Button } from '@/components/ui/button';

interface ChatInputProps {
  onSend: (message: string) => void;
}

export function ChatInput({ onSend }: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isProcessing } = useChatStore();

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = () => {
    if (!input.trim() || isProcessing) return;
    onSend(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="shrink-0 px-6 pb-6 pt-2 bg-white">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end gap-2 overflow-hidden bg-[#f3f4f6] rounded-3xl border border-gray-200/80 px-4 py-3 focus-within:border-gray-300 focus-within:bg-white transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="发送消息"
            rows={1}
            disabled={isProcessing}
            className="flex-1 min-h-[36px] max-h-[200px] px-1 py-1 bg-transparent resize-none border-0 outline-none text-[15px] leading-relaxed text-gray-800 placeholder-gray-400 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          />

          <Button
            onClick={handleSubmit}
            disabled={!input.trim() || isProcessing}
            size="icon"
            className="shrink-0 mb-0.5 h-8 w-8 rounded-full bg-gray-800 hover:bg-gray-700 disabled:bg-gray-300"
            title="发送"
          >
            <ArrowUp size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
