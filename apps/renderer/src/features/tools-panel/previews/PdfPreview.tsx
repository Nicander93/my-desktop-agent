/** object URL 嵌入 PDF */
import { useEffect, useState } from "react";
import { base64ToBlob } from "@/lib/binaryUtils";

/**
 * 用于创建浏览器 object URL 的 PDF Base64 内容和 MIME 类型。
 */
interface PdfPreviewProps {
  content: string;
  mimeType: string;
}

/**
 * 将 PDF 二进制转换为生命周期受控的 object URL，并嵌入 iframe 预览。
 */
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
