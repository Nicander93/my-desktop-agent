import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { formatThoughtDuration } from '@/lib/toolActivitySummary';
import { cn } from '@/lib/utils';

interface ThoughtSectionProps {
  thinking: string;
  durationMs?: number;
  isStreaming?: boolean;
}

export function ThoughtSection({ thinking, durationMs, isStreaming }: ThoughtSectionProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isStreaming) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [isStreaming]);

  const label = durationMs
    ? `Thought for ${formatThoughtDuration(durationMs)}`
    : isStreaming
      ? 'Thinking…'
      : 'Thought';

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-600 transition-colors"
      >
        <ChevronRight
          size={14}
          className={cn('flex-shrink-0 transition-transform text-gray-400', open && 'rotate-90')}
        />
        <span>{label}</span>
      </button>

      {open && thinking && (
        <div className="mt-2 pl-3 border-l border-gray-200 text-[13px] text-gray-500 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
          {thinking}
          {isStreaming && <span className="text-gray-400"> …</span>}
        </div>
      )}
    </div>
  );
}
