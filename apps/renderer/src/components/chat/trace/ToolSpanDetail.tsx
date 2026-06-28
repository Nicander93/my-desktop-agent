import type { TraceSpan } from '@desktop-agent/shared';
import {
  formatToolInputValue,
  isSimpleToolInput,
  summarizeToolPayload,
} from '@/lib/llmTraceFormat';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CodeBlock } from '../CodeBlock';

interface ToolSpanDetailProps {
  span: TraceSpan;
}

export function ToolSpanDetail({ span }: ToolSpanDetailProps) {
  const payload = span.payload;
  const summary = summarizeToolPayload(payload, span.type);

  if (span.type === 'tool_call') {
    const input = (payload as { input?: unknown })?.input;

    return (
      <div className="space-y-2">
        {input != null && (
          isSimpleToolInput(input) ? (
            <dl className="space-y-1 text-[12px]">
              {Object.entries(input as Record<string, unknown>).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <dt className="flex-shrink-0 font-medium text-gray-500">{key}</dt>
                  <dd className="text-gray-700 break-all whitespace-pre-wrap">
                    {formatToolInputValue(value)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <CodeBlock language="json">
              {JSON.stringify(input, null, 2)}
            </CodeBlock>
          )
        )}
      </div>
    );
  }

  if (span.type === 'tool_result') {
    const output = (payload as { output?: string })?.output ?? '';
    const isError = summary.isError;

    return (
      <div
        className={cn(
          'rounded border p-2',
          isError ? 'border-red-200 bg-red-50/50' : 'border-gray-100 bg-white/80',
        )}
      >
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          {isError && (
            <Badge variant="outline" className="border-red-200 text-red-700 bg-red-50">
              错误
            </Badge>
          )}
          {summary.truncated && (
            <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">
              已截断
            </Badge>
          )}
          {summary.outputLen != null && summary.outputLen > 0 && (
            <span className="text-[11px] text-gray-400">
              {summary.outputLen.toLocaleString()} 字符
            </span>
          )}
        </div>
        <pre
          className={cn(
            'text-[12px] whitespace-pre-wrap break-words max-h-64 overflow-y-auto font-sans leading-relaxed',
            isError ? 'text-red-800' : 'text-gray-700',
          )}
        >
          {output || '—'}
        </pre>
      </div>
    );
  }

  return null;
}
