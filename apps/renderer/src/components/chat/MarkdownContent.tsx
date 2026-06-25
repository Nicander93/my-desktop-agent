import { useMemo } from 'react';
import { splitMarkdownBlocks } from '@/lib/splitMarkdownBlocks';
import { MarkdownBlock } from './MarkdownBlock';
import { StreamingIndicator } from './StreamingIndicator';

interface MarkdownContentProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
}

export function MarkdownContent({ content, isStreaming, className }: MarkdownContentProps) {
  const blocks = useMemo(
    () => splitMarkdownBlocks(content, !!isStreaming),
    [content, isStreaming],
  );

  if (blocks.length === 0) {
    return isStreaming ? (
      <div className={className}>
        <StreamingIndicator />
      </div>
    ) : null;
  }

  return (
    <div className={`space-y-3 ${className ?? ''}`}>
      {blocks.map((block, idx) => {
        const isLast = idx === blocks.length - 1;
        const showCursor = !!isStreaming && isLast && !block.complete;

        if (block.complete) {
          return <MarkdownBlock key={block.id} content={block.content} />;
        }

        return (
          <div
            key={block.id}
            className="text-[15px] leading-7 text-gray-800 whitespace-pre-wrap"
          >
            {block.content}
            {showCursor && <StreamingIndicator />}
          </div>
        );
      })}
    </div>
  );
}
