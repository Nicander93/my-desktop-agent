import { useState, useRef, useEffect, useMemo } from 'react';
import { ArrowUp } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { useMcpStore } from '@/stores/mcpStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FileMentionPicker } from './FileMentionPicker';
import { useFileMentionSearch } from '@/hooks/useFileMentionSearch';

type MentionKind = 'file' | 'mcp' | null;

interface ChatInputProps {
  onSend: (message: string) => void;
}

export function ChatInput({ onSend }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [mentionKind, setMentionKind] = useState<MentionKind>(null);
  const [mentionQuery, setMentionQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isProcessing } = useChatStore();
  const { mentionable, loadMentionable } = useMcpStore();
  const { results: fileResults, loading: fileLoading } = useFileMentionSearch(
    mentionQuery,
    mentionKind === 'file',
  );

  useEffect(() => {
    loadMentionable();
  }, [loadMentionable]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const filteredMcp = useMemo(() => {
    const query = mentionQuery.toLowerCase();
    return mentionable.filter((item) =>
      item.name.toLowerCase().includes(query) ||
      item.displayName.toLowerCase().includes(query),
    );
  }, [mentionable, mentionQuery]);

  const activeListLength = mentionKind === 'file' ? fileResults.length : filteredMcp.length;

  const updateMentionState = (value: string, cursor: number) => {
    const beforeCursor = value.slice(0, cursor);
    const fileMatch = beforeCursor.match(/@([^\s@]*)$/);
    const mcpMatch = beforeCursor.match(/\$([a-zA-Z][a-zA-Z0-9_-]*)$/);

    if (fileMatch && mcpMatch) {
      const fileStart = fileMatch.index ?? 0;
      const mcpStart = mcpMatch.index ?? 0;
      if (fileStart > mcpStart) {
        setMentionKind('file');
        setMentionQuery(fileMatch[1]);
      } else {
        setMentionKind('mcp');
        setMentionQuery(mcpMatch[1]);
      }
    } else if (fileMatch) {
      setMentionKind('file');
      setMentionQuery(fileMatch[1]);
    } else if (mcpMatch) {
      setMentionKind('mcp');
      setMentionQuery(mcpMatch[1]);
    } else {
      setMentionKind(null);
      setMentionQuery('');
    }
    setSelectedIndex(0);
  };

  const insertFileMention = (relativePath: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart;
    const beforeCursor = input.slice(0, cursor);
    const afterCursor = input.slice(cursor);
    const replaced = beforeCursor.replace(/@[^\s@]*$/, `@${relativePath} `);
    const next = `${replaced}${afterCursor}`;
    setInput(next);
    setMentionKind(null);
    setMentionQuery('');
    requestAnimationFrame(() => textarea.focus());
  };

  const insertMcpMention = (name: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart;
    const beforeCursor = input.slice(0, cursor);
    const afterCursor = input.slice(cursor);
    const replaced = beforeCursor.replace(/\$[a-zA-Z][a-zA-Z0-9_-]*$/, `$${name} `);
    const next = `${replaced}${afterCursor}`;
    setInput(next);
    setMentionKind(null);
    setMentionQuery('');
    requestAnimationFrame(() => textarea.focus());
  };

  const closeMentionMenu = () => {
    setMentionKind(null);
    setMentionQuery('');
  };

  const handleSubmit = () => {
    if (!input.trim() || isProcessing) return;
    onSend(input.trim());
    setInput('');
    closeMentionMenu();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionKind && activeListLength > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % activeListLength);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + activeListLength) % activeListLength);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        if (mentionKind === 'file') {
          insertFileMention(fileResults[selectedIndex].relativePath);
        } else {
          insertMcpMention(filteredMcp[selectedIndex].name);
        }
        return;
      }
      if (e.key === 'Escape') {
        closeMentionMenu();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="shrink-0 px-6 pb-6 pt-2 bg-white">
      <div className="max-w-3xl mx-auto relative">
        {mentionKind === 'file' && (fileResults.length > 0 || fileLoading) && (
          <FileMentionPicker
            results={fileResults}
            selectedIndex={selectedIndex}
            loading={fileLoading}
            onSelect={insertFileMention}
          />
        )}

        {mentionKind === 'mcp' && filteredMcp.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
            {filteredMcp.map((item, index) => (
              <button
                key={item.name}
                type="button"
                className={cn(
                  'w-full px-4 py-2 text-left hover:bg-gray-50',
                  index === selectedIndex && 'bg-gray-50',
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMcpMention(item.name);
                }}
              >
                <div className="text-sm font-medium">${item.name}</div>
                <div className="text-xs text-gray-500">{item.displayName}</div>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 overflow-hidden bg-[#f3f4f6] rounded-3xl border border-gray-200/80 px-4 py-3 focus-within:border-gray-300 focus-within:bg-white transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              updateMentionState(e.target.value, e.target.selectionStart);
            }}
            onClick={(e) => updateMentionState(input, e.currentTarget.selectionStart)}
            onKeyDown={handleKeyDown}
            placeholder="发送消息，@ 引用文件，$ 选择 MCP"
            rows={1}
            disabled={isProcessing}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
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
