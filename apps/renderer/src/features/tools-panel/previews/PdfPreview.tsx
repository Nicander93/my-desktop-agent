import { useEffect, useState } from 'react';
import { base64ToBlob } from '@/lib/binaryUtils';

interface PdfPreviewProps {
  content: string;
  mimeType: string;
}

export function PdfPreview({ content, mimeType }: PdfPreviewProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const blob = base64ToBlob(content, mimeType);
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [content, mimeType]);

  if (!url) return null;

  return (
    <iframe
      src={url}
      title="PDF 预览"
      className="flex-1 w-full min-h-[400px] border-0 bg-gray-100"
    />
  );
}
