import { useState } from 'react';
import type { LlmRequestPayload } from '@desktop-agent/shared';
import {
  extractToolNames,
  normalizeTraceMessage,
  summarizeLlmRequest,
} from '@/lib/llmTraceFormat';
import { formatTokenCount } from '@/lib/traceUtils';
import { Badge } from '@/components/ui/badge';
import { MarkdownBlock } from '../MarkdownBlock';
import { CodeBlock } from '../CodeBlock';
import { TraceCollapsibleSection } from './TraceCollapsibleSection';

const ROLE_COLORS: Record<string, string> = {
  user: 'bg-blue-50 text-blue-700 border-blue-100',
  assistant: 'bg-purple-50 text-purple-700 border-purple-100',
  tool: 'bg-amber-50 text-amber-700 border-amber-100',
  system: 'bg-gray-50 text-gray-600 border-gray-100',
};

function MessageCard({ msg, index }: { msg: unknown; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const { role, text, preview, isLong } = normalizeTraceMessage(msg);
  const roleClass = ROLE_COLORS[role] ?? ROLE_COLORS.system;

  return (
    <div className="rounded border border-gray-100 bg-gray-50/50 p-2">
      <div className="flex items-center gap-2 mb-1">
        <Badge variant="outline" className={roleClass}>
          {role}
        </Badge>
        <span className="text-[11px] text-gray-400">#{index + 1}</span>
      </div>
      <div className="text-[12px] text-gray-700 whitespace-pre-wrap break-words leading-relaxed max-h-48 overflow-y-auto">
        {isLong && !expanded ? (
          <>
            {preview}
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="ml-1 text-indigo-500 hover:text-indigo-700"
            >
              …展开
            </button>
          </>
        ) : (
          text
        )}
      </div>
    </div>
  );
}

interface LlmRequestDetailProps {
  payload: LlmRequestPayload;
}

export function LlmRequestDetail({ payload }: LlmRequestDetailProps) {
  const summary = summarizeLlmRequest(payload);
  const toolNames = extractToolNames(payload.tools);
  const messages = Array.isArray(payload.messages) ? payload.messages : [];

  return (
    <div className="space-y-2">
      {(summary.estimatedTokens != null || summary.maxTokens != null || summary.thinking) && (
        <div className="flex flex-wrap gap-2 text-[11px] text-gray-500">
          {summary.estimatedTokens != null && (
            <span>预估输入 {formatTokenCount(summary.estimatedTokens)} tokens</span>
          )}
          {summary.maxTokens != null && (
            <span>max {formatTokenCount(summary.maxTokens)}</span>
          )}
          {summary.thinking && (
            <span>
              thinking: {summary.thinking.type}
              {summary.thinking.budget_tokens != null && ` (${summary.thinking.budget_tokens})`}
            </span>
          )}
        </div>
      )}

      {payload.system && (
        <TraceCollapsibleSection
          title="System"
          summary={`${summary.systemLen.toLocaleString()} 字符`}
          defaultOpen={false}
        >
          <div className="max-h-64 overflow-y-auto text-[12px]">
            <MarkdownBlock content={payload.system} />
          </div>
        </TraceCollapsibleSection>
      )}

      {messages.length > 0 && (
        <TraceCollapsibleSection
          title="Messages"
          summary={`${summary.messageCount} 条`}
          defaultOpen
        >
          <div className="space-y-1.5">
            {messages.map((msg, i) => (
              <MessageCard key={i} msg={msg} index={i} />
            ))}
          </div>
        </TraceCollapsibleSection>
      )}

      {toolNames.length > 0 && (
        <TraceCollapsibleSection
          title="Tools"
          summary={`${summary.toolCount} 个 · ${toolNames.join(', ')}`}
          defaultOpen={false}
        >
          <div className="space-y-2">
            {payload.tools?.map((tool, i) => (
              <div key={i}>
                <div className="text-[11px] font-medium text-gray-600 mb-1">
                  {toolNames[i]}
                </div>
                <CodeBlock language="json">
                  {JSON.stringify(tool, null, 2)}
                </CodeBlock>
              </div>
            ))}
          </div>
        </TraceCollapsibleSection>
      )}
    </div>
  );
}
