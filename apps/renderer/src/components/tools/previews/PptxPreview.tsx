import { useEffect, useRef, useState } from 'react';
import { init } from 'pptx-preview';
import { base64ToArrayBuffer } from '@/lib/binaryUtils';

interface PptxPreviewProps {
  content: string;
}

export function PptxPreview({ content }: PptxPreviewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    setError(null);
    el.innerHTML = '';

    const width = el.clientWidth || 280;
    const height = Math.round(width * 9 / 16);

    try {
      const viewer = init(el, { width, height });
      viewer.preview(base64ToArrayBuffer(content));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PPT 渲染失败');
    }

    return () => {
      el.innerHTML = '';
    };
  }, [content]);

  if (error) {
    return <p className="p-3 text-sm text-red-600">{error}</p>;
  }

  return <div ref={wrapperRef} className="flex-1 overflow-auto p-2 bg-gray-100" />;
}
