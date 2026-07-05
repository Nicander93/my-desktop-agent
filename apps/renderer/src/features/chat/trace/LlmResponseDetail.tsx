import type { LlmResponsePayload } from '@desktop-agent/shared';
import { parseContentBlocks, summarizeLlmResponse } from '@/lib/llmTraceFormat';
import { formatTokenCount } from '@/lib/traceUtils';
import { Badge } from '@/components/ui/badge';
import { MarkdownBlock } from '../MarkdownBlock';
import { CodeBlock } from '../CodeBlock';
import { TraceCollapsibleSection } from './TraceCollapsibleSection';

interface LlmResponseDetailProps {
  payload: LlmResponsePayload;
}

export function LlmResponseDetail({ payload }: LlmResponseDetailProps) {
  const summary = summarizeLlmResponse(payload);
  const content = Array.isArray(payload.content) ? payload.content : [];
  const blocks = parseContentBlocks(content);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {summary.stopReason && (
          <Badge variant="secondary">{summary.stopReason}</Badge>
        )}
        {(summary.inputTokens != null || summary.outputTokens != null) && (
          <span className="text-gray-500">
            {formatTokenCount(summary.inputTokens)} → {formatTokenCount(summary.outputTokens)} tokens
          </span>
        )}
        {summary.blockCount > 0 && (
          <span className="text-gray-400">{summary.blockCount} blocks</span>
        )}
      </div>

      {blocks.length > 0 ? (
        <div className="space-y-2">
          {blocks.map((block, i) => {
            if (block.type === 'text' && block.text) {
              const isShort = block.text.length < 500;
              return (
                <div key={i} className="rounded border border-gray-100 bg-white/80 p-2">
                  <div className="text-[11px] text-gray-400 mb-1">text</div>
                  {isShort ? (
                    <div className="text-[12px] text-gray-700 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                      {block.text}
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto text-[12px]">
                      <MarkdownBlock content={block.text} />
                    </div>
                  )}
                </div>
              );
            }

            if (block.type === 'tool_use') {
              return (
                <div key={i} className="rounded border border-indigo-100 bg-indigo-50/30 p-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] text-gray-400">tool_use</span>
                    {block.name && <Badge variant="outline">{block.name}</Badge>}
                  </div>
                  {block.input != null && (
                    <CodeBlock language="json">
                      {JSON.stringify(block.input, null, 2)}
                    </CodeBlock>
                  )}
                </div>
              );
            }

            if (block.type === 'thinking' && block.text) {
              return (
                <TraceCollapsibleSection
                  key={i}
                  title="Thinking"
                  summary={`${block.text.length} 字符`}
                  defaultOpen={false}
                >
                  <div className="text-[12px] text-gray-600 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                    {block.text}
                  </div>
                </TraceCollapsibleSection>
              );
            }

            return (
              <TraceCollapsibleSection
                key={i}
                title={block.type}
                defaultOpen={false}
              >
                <pre className="text-[11px] text-gray-600 whitespace-pre-wrap break-words max-h-48 overflow-y-auto font-mono">
                  {block.text ?? JSON.stringify(block.raw, null, 2)}
                </pre>
              </TraceCollapsibleSection>
            );
          })}
        </div>
      ) : (
        <div className="text-[12px] text-gray-400">无内容</div>
      )}
    </div>
  );
}
