/** Shiki 高亮代码块，带复制按钮 */
import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { highlightCode } from "@/lib/shikiHighlighter";
import { useUIStore } from "@/stores/uiStore";

/**
 * Markdown 代码块的原始内容与可选语言标识。
 */
interface CodeBlockProps {
  language?: string;
  children: string;
}

/** Markdown 内嵌代码块 */
/**
 * 异步高亮 Markdown 代码，并在高亮不可用时安全降级为原始 pre 内容。
 */
export function CodeBlock({ language, children }: CodeBlockProps) {
  const code = children.replace(/\n$/, "");
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const resolvedTheme = useUIStore((s) => s.resolvedTheme);

  useEffect(() => {
    let cancelled = false;
    highlightCode(code, language, resolvedTheme)
      .then((result) => {
        if (!cancelled) setHtml(result);
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, language, resolvedTheme]);

  /**
   * 写入完整代码文本，并短暂显示已复制状态以提供操作反馈。
   */
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-3 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] overflow-hidden bg-[var(--color-bg-subtle)]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
        <span className="text-xs text-[var(--color-text-muted)] font-mono">
          {language || "text"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
          title="复制"
          aria-label="复制"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      {html ? (
        <div
          className="overflow-x-auto text-sm [&_pre]:!m-0 [&_pre]:!p-4 [&_pre]:!bg-transparent"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="m-0 p-4 text-sm font-mono text-[var(--color-text-primary)] overflow-x-auto">
          {code}
        </pre>
      )}
    </div>
  );
}
