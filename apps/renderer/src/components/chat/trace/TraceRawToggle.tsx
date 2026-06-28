import { useState, type ReactNode } from 'react';
import { stringifyTracePayload } from '@/lib/traceUtils';
import { cn } from '@/lib/utils';

interface TraceRawToggleProps {
  payload: unknown;
  children: ReactNode;
}

export function TraceRawToggle({ payload, children }: TraceRawToggleProps) {
  const [view, setView] = useState<'structured' | 'raw'>('structured');

  return (
    <div>
      <div className="flex justify-end mb-1.5">
        <div className="inline-flex rounded border border-gray-200 bg-white text-[11px] overflow-hidden">
          <button
            type="button"
            onClick={() => setView('structured')}
            className={cn(
              'px-2 py-0.5 transition-colors',
              view === 'structured' ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:text-gray-600',
            )}
          >
            结构化
          </button>
          <button
            type="button"
            onClick={() => setView('raw')}
            className={cn(
              'px-2 py-0.5 transition-colors border-l border-gray-200',
              view === 'raw' ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:text-gray-600',
            )}
          >
            原始 JSON
          </button>
        </div>
      </div>
      {view === 'structured' ? (
        children
      ) : (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-gray-600 max-h-96 overflow-y-auto rounded border border-gray-100 bg-white p-2">
          {stringifyTracePayload(payload)}
        </pre>
      )}
    </div>
  );
}
