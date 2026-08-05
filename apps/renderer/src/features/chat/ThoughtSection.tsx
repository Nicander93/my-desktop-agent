/** 可折叠 thinking 区块，流式时默认展开 */
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatThoughtDuration } from "@/lib/toolActivitySummary";
import { cn } from "@/lib/utils";

/**
 * 可折叠思考文本的内容、可选耗时和当前流式状态。
 */
interface ThoughtSectionProps {
  thinking: string;
  durationMs?: number;
  isStreaming?: boolean;
}

/** 思考过程展示 */
export function ThoughtSection({
  thinking,
  durationMs,
  isStreaming,
}: ThoughtSectionProps) {
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
      ? "Thinking…"
      : "Thought";

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[13px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-secondary)] transition-colors"
      >
        <ChevronRight
          size={14}
          className={cn(
            "flex-shrink-0 transition-transform text-[var(--color-text-muted)]",
            open && "rotate-90",
          )}
        />
        <span>{label}</span>
      </button>

      {open && thinking && (
        <div className="mt-2 pl-3 border-l border-[var(--color-border-default)] text-[13px] text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
          {thinking}
          {isStreaming && (
            <span className="text-[var(--color-text-muted)]"> …</span>
          )}
        </div>
      )}
    </div>
  );
}
