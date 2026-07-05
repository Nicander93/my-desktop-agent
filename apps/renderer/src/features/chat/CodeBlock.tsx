import { useEffect, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { highlightCode } from '@/lib/shikiHighlighter';

interface CodeBlockProps {
  language?: string;
  children: string;
}

export function CodeBlock({ language, children }: CodeBlockProps) {
  const code = children.replace(/\n$/, '');
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    highlightCode(code, language)
      .then((result) => {
        if (!cancelled) setHtml(result);
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => { cancelled = true; };
  }, [code, language]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-3 rounded-lg border border-gray-200 overflow-hidden bg-[#f6f8fa]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 bg-gray-50">
        <span className="text-xs text-gray-500 font-mono">{language || 'text'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          title="复制"
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
        <pre className="m-0 p-4 text-sm font-mono text-gray-800 overflow-x-auto">{code}</pre>
      )}
    </div>
  );
}
