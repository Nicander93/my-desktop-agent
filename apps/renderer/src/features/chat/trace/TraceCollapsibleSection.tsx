import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TraceCollapsibleSectionProps {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

export function TraceCollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  children,
  className,
}: TraceCollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn('rounded border border-gray-100 bg-white/60', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-gray-600 hover:text-gray-800"
      >
        <ChevronRight
          size={13}
          className={cn('flex-shrink-0 text-gray-400 transition-transform', open && 'rotate-90')}
        />
        <span className="font-medium text-gray-700">{title}</span>
        {summary && <span className="text-gray-400 truncate">{summary}</span>}
      </button>
      {open && <div className="px-2.5 pb-2.5">{children}</div>}
    </div>
  );
}
