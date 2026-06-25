import { useEffect } from 'react';
import { File, Code, FileText, Image, Save, X, Loader2, FileSpreadsheet, Presentation } from 'lucide-react';
import { useEditorStore, type EditorFileType } from '@/stores/editorStore';
import { Button } from '@/components/ui/button';
import { DocxPreview } from './previews/DocxPreview';
import { PptxPreview } from './previews/PptxPreview';
import { XlsxPreview } from './previews/XlsxPreview';
import { PdfPreview } from './previews/PdfPreview';

function getFileName(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function FileTypeIcon({ fileType }: { fileType: EditorFileType }) {
  switch (fileType) {
    case 'text':
      return <Code size={16} className="text-[var(--color-primary-500)] shrink-0" />;
    case 'image':
      return <Image size={16} className="text-[var(--color-primary-500)] shrink-0" />;
    case 'docx':
      return <FileText size={16} className="text-[var(--color-primary-500)] shrink-0" />;
    case 'pptx':
      return <Presentation size={16} className="text-[var(--color-primary-500)] shrink-0" />;
    case 'xlsx':
      return <FileSpreadsheet size={16} className="text-[var(--color-primary-500)] shrink-0" />;
    case 'pdf':
    case 'binary':
    default:
      return <FileText size={16} className="text-[var(--color-primary-500)] shrink-0" />;
  }
}

export function FilePreview() {
  const {
    activeFile,
    content,
    fileType,
    mimeType,
    isDirty,
    isLoading,
    error,
    updateContent,
    saveFile,
    closeFile,
  } = useEditorStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty && fileType === 'text') {
          saveFile();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDirty, fileType, saveFile]);

  if (!activeFile) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-4">
        <File size={48} className="text-gray-300 mb-3" />
        <p className="text-sm text-gray-500">选择文件进行预览</p>
        <p className="text-xs text-gray-400 mt-1">点击对话中的文件或使用文件树选择</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[200px]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 shrink-0">
        <FileTypeIcon fileType={fileType} />
        <span className="text-sm font-medium text-gray-700 truncate flex-1" title={activeFile}>
          {getFileName(activeFile)}
          {isDirty && <span className="text-orange-500 ml-1">●</span>}
        </span>
        {isDirty && fileType === 'text' && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveFile()} disabled={isLoading} title="保存 (Ctrl+S)">
            <Save size={14} />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeFile} title="关闭">
          <X size={14} />
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center flex-1 p-4 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          <span className="text-sm">加载中...</span>
        </div>
      )}

      {!isLoading && error && (
        <div className="p-4 text-sm text-red-600">{error}</div>
      )}

      {!isLoading && !error && fileType === 'text' && content !== null && (
        <textarea
          className="flex-1 w-full p-3 text-xs font-mono text-gray-700 bg-gray-50 resize-none outline-none border-0 min-h-[300px]"
          value={content}
          onChange={(e) => updateContent(e.target.value)}
          spellCheck={false}
        />
      )}

      {!isLoading && !error && fileType === 'image' && content !== null && mimeType && (
        <div className="flex-1 p-3 overflow-auto flex items-start justify-center">
          <img
            src={`data:${mimeType};base64,${content}`}
            alt={getFileName(activeFile)}
            className="max-w-full h-auto rounded"
          />
        </div>
      )}

      {!isLoading && !error && fileType === 'docx' && content !== null && (
        <DocxPreview content={content} />
      )}

      {!isLoading && !error && fileType === 'pptx' && content !== null && (
        <PptxPreview content={content} />
      )}

      {!isLoading && !error && fileType === 'xlsx' && content !== null && (
        <XlsxPreview content={content} />
      )}

      {!isLoading && !error && fileType === 'pdf' && content !== null && mimeType && (
        <PdfPreview content={content} mimeType={mimeType} />
      )}

      {!isLoading && !error && fileType === 'binary' && (
        <div className="flex flex-col items-center justify-center flex-1 p-4 text-center">
          <FileText size={32} className="text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">此文件类型不支持预览</p>
        </div>
      )}
    </div>
  );
}
