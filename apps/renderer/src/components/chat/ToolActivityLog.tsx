import { useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { ToolCall } from '@/stores/chatStore';
import { getToolActivityLabel } from '@/lib/toolActivityLabel';
import { summarizeToolActivity } from '@/lib/toolActivitySummary';
import { cn } from '@/lib/utils';

interface ToolActivityLogProps {
  toolCalls: ToolCall[];
  isStreaming?: boolean;
}

function isActiveStatus(status: ToolCall['status']): boolean {
  return status === 'running' || status === 'pending';
}

export function ToolActivityLog({ toolCalls, isStreaming }: ToolActivityLogProps) {
  const activeCount = toolCalls.filter((t) => isActiveStatus(t.status)).length;
  const [open, setOpen] = useState(false);

  if (toolCalls.length === 0) return null;

  const summary = summarizeToolActivity(toolCalls);

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-600"
      >
        {activeCount > 0 && (
          <Loader2 size={12} className="animate-spin flex-shrink-0" />
        )}
        <span>{summary}</span>
        <ChevronDown
          size={14}
          className={cn('transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="mt-1 space-y-0.5 pl-0.5">
          {toolCalls.map((toolCall) => {
            const active = isActiveStatus(toolCall.status);
            return (
              <div
                key={toolCall.id}
                className={cn(
                  'flex items-center gap-2 text-[13px] leading-5 font-mono',
                  active ? 'text-gray-700' : 'text-gray-400',
                )}
              >
                {active && (
                  <Loader2 size={12} className="animate-spin flex-shrink-0 text-gray-400" />
                )}
                <span className="truncate">{getToolActivityLabel(toolCall.toolName, toolCall.input)}</span>
              </div>
            );
          })}
          {isStreaming && activeCount === 0 && (
            <div className="text-[13px] text-gray-400 font-mono">…</div>
          )}
        </div>
      )}
    </div>
  );
}
