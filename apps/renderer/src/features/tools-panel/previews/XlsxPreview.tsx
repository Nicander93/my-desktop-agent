import { useMemo } from 'react';
import * as XLSX from 'xlsx';
import { base64ToArrayBuffer } from '@/lib/binaryUtils';

interface XlsxPreviewProps {
  content: string;
}

export function XlsxPreview({ content }: XlsxPreviewProps) {
  const { html, sheetNames, error } = useMemo(() => {
    try {
      const wb = XLSX.read(base64ToArrayBuffer(content), { type: 'array' });
      const name = wb.SheetNames[0];
      if (!name) {
        return { html: '', sheetNames: [] as string[], error: '工作簿为空' };
      }
      const sheet = wb.Sheets[name];
      const tableHtml = XLSX.utils.sheet_to_html(sheet, { id: 'xlsx-preview-table' });
      return { html: tableHtml, sheetNames: wb.SheetNames, error: null };
    } catch (err) {
      return {
        html: '',
        sheetNames: [] as string[],
        error: err instanceof Error ? err.message : 'Excel 解析失败',
      };
    }
  }, [content]);

  if (error) {
    return <p className="p-3 text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="flex-1 overflow-auto p-2">
      {sheetNames.length > 1 && (
        <p className="text-xs text-gray-500 mb-2">预览工作表：{sheetNames[0]}</p>
      )}
      <div
        className="text-xs [&_table]:border-collapse [&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-gray-200 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-gray-50"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
