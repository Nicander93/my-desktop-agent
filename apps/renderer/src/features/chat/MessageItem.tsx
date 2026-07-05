import { useState } from 'react';
import { Check, Copy, ExternalLink, Pencil } from 'lucide-react';
import type { MessagePart } from '@desktop-agent/shared';
import { Message, ToolCall } from '@/stores/chatStore';
import { MarkdownContent } from './MarkdownContent';
import { ToolActivityLog } from './ToolActivityLog';
import { ThoughtSection } from './ThoughtSection';
import { useUIStore } from '@/stores/uiStore';
import { getStreamPhase } from '@/lib/agentMessage';
import { derivePartsFromLegacy } from '@/lib/messageParts';

interface MessageItemProps {
  message: Message;
}

function resolveParts(message: Message): MessagePart[] {
  if (message.parts?.length) return message.parts;
  return derivePartsFromLegacy(message);
}

function getToolCallsForGroup(group: Extract<MessagePart, { type: 'tool_group' }>, all: ToolCall[]): ToolCall[] {
  return group.toolCallIds
    .map((id) => all.find((t) => t.id === id))
    .filter((t): t is ToolCall => !!t);
}

export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const openTracePanel = useUIStore((s) => s.openTracePanel);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
  const parts = resolveParts(message);
  const phase = getStreamPhase(toolCalls);
  const hasTrace = (message.trace?.spans.length ?? 0) > 0;
  const canCopy = !!message.content?.trim() && !message.isStreaming;

  const lastPartIndex = parts.length - 1;
  const lastPart = parts[lastPartIndex];
  const isThoughtStreaming =
    !!message.isStreaming && lastPart?.type === 'thinking';
  const showTextCursor =
    !!message.isStreaming && phase === 'responding' && lastPart?.type === 'text';
  const showResponse = parts.some((p) => p.type === 'text') || isThoughtStreaming;

  return (
    <div className="py-2 group">
      {parts.map((part, index) => {
        const isLast = index === lastPartIndex;

        if (part.type === 'thinking') {
          return (
            <ThoughtSection
              key={part.id}
              thinking={part.text}
              durationMs={isLast ? message.thinkingDurationMs : undefined}
              isStreaming={isLast && isThoughtStreaming}
            />
          );
        }

        if (part.type === 'tool_group') {
          const groupTools = getToolCallsForGroup(part, toolCalls);
          if (groupTools.length === 0) return null;
          return (
            <ToolActivityLog
              key={part.id}
              toolCalls={groupTools}
              traceSpans={message.trace?.spans}
              isStreaming={isLast && !!message.isStreaming}
            />
          );
        }

        if (part.type === 'text') {
          const prev = parts[index - 1];
          if (prev?.type === 'thinking' && prev.text.trim() === part.text.trim()) {
            return null;
          }
          return (
            <div key={part.id} className="mb-3 last:mb-0">
              <MarkdownContent
                content={part.text}
                isStreaming={isLast && showTextCursor}
              />
            </div>
          );
        }

        return null;
      })}

      {hasTrace && (
        <button
          type="button"
          onClick={openTracePanel}
          className="mb-2 flex items-center gap-1 text-[12px] text-indigo-600/80 hover:text-indigo-700 transition-colors"
        >
          <ExternalLink size={12} />
          在右侧面板查看 Trace
        </button>
      )}

      {!showResponse && message.isStreaming && parts.length === 0 && (
        <div className="text-gray-400 text-[15px]">…</div>
      )}

      {canCopy && (
        <div className="flex justify-end gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            title="复制"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      )}
    </div>
  );
}
