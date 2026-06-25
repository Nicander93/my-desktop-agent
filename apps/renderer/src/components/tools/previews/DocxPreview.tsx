import { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { base64ToArrayBuffer } from '@/lib/binaryUtils';

interface DocxPreviewProps {
  content: string;
}

export function DocxPreview({ content }: DocxPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    setError(null);
    el.innerHTML = '';

    renderAsync(base64ToArrayBuffer(content), el, undefined, {
      className: 'docx-preview',
      inWrapper: true,
      ignoreWidth: true,
      ignoreHeight: true,
    }).catch((err) => {
      setError(err instanceof Error ? err.message : 'Word 文档渲染失败');
    });
  }, [content]);

  if (error) {
    return <p className="p-3 text-sm text-red-600">{error}</p>;
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto p-2 bg-white text-sm [&_.docx-wrapper]:max-w-full"
    />
  );
}
