/** 流式 Markdown：按块渲染，尾块可带光标 */
import { useMemo } from "react";
import { splitMarkdownBlocks } from "@/lib/splitMarkdownBlocks";
import { MarkdownBlock } from "./MarkdownBlock";
import { StreamingIndicator } from "./StreamingIndicator";

/**
 * 流式 Markdown 容器的文本、流式状态和附加布局类。
 */
interface MarkdownContentProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
}

/** 多块 Markdown 容器 */
/**
 * 按完整性分块渲染 Markdown，使未完成的流式尾块保持为纯文本并显示光标。
 */
export function MarkdownContent({
  content,
  isStreaming,
  className,
}: MarkdownContentProps) {
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
    <div className={`space-y-3 ${className ?? ""}`}>
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
