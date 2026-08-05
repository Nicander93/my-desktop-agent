/**
 * 文件编辑/预览主区：Monaco 或 Office/PDF 预览
 */
import { useEffect, useState } from "react";
import {
  File,
  Code,
  FileText,
  Image,
  Save,
  X,
  Loader2,
  FileSpreadsheet,
  Presentation,
  Globe,
} from "lucide-react";
import { useEditorStore, type EditorFileType } from "@/stores/editorStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MonacoCodeEditor } from "./MonacoCodeEditor";
import { DocxPreview } from "./previews/DocxPreview";
import { PptxPreview } from "./previews/PptxPreview";
import { XlsxPreview } from "./previews/XlsxPreview";
import { PdfPreview } from "./previews/PdfPreview";
import { HtmlPreview } from "./previews/HtmlPreview";

/**
 * 从跨平台文件路径中提取供编辑器标题展示的末级名称。
 */
function getFileName(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

/**
 * 为编辑器支持的文件类型选择一致的标题栏图标。
 */
function FileTypeIcon({ fileType }: { fileType: EditorFileType }) {
  switch (fileType) {
    case "text":
      return (
        <Code size={16} className="text-[var(--color-primary-500)] shrink-0" />
      );
    case "image":
      return (
        <Image size={16} className="text-[var(--color-primary-500)] shrink-0" />
      );
    case "docx":
      return (
        <FileText
          size={16}
          className="text-[var(--color-primary-500)] shrink-0"
        />
      );
    case "pptx":
      return (
        <Presentation
          size={16}
          className="text-[var(--color-primary-500)] shrink-0"
        />
      );
    case "xlsx":
      return (
        <FileSpreadsheet
          size={16}
          className="text-[var(--color-primary-500)] shrink-0"
        />
      );
    case "html":
      return (
        <Globe size={16} className="text-[var(--color-primary-500)] shrink-0" />
      );
    case "pdf":
    case "binary":
    default:
      return (
        <FileText
          size={16}
          className="text-[var(--color-primary-500)] shrink-0"
        />
      );
  }
}

/**
 * 未打开文件时显示的可替换提示文本。
 */
interface FileEditorPaneProps {
  emptyHint?: string;
}

/**
 * 根据活动文件类型在 Monaco 编辑、二进制预览与 Office/PDF/HTML 预览间切换。
 *
 * 全局 Ctrl/Cmd+S 只会保存可编辑文本，HTML 预览模式不会写回源文件。
 */
export function FileEditorPane({
  emptyHint = "点击左侧文件进行编辑",
}: FileEditorPaneProps) {
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
  const [htmlViewMode, setHtmlViewMode] = useState<"preview" | "source">(
    "preview",
  );

  useEffect(() => {
    setHtmlViewMode("preview");
  }, [activeFile]);

  const isEditableText = fileType === "text" || fileType === "html";

  useEffect(() => {
    /**
     * 拦截浏览器默认保存快捷键，并仅在可写源码视图触发 store 保存。
     */
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (
          isDirty &&
          isEditableText &&
          (fileType !== "html" || htmlViewMode === "source")
        ) {
          saveFile();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDirty, fileType, htmlViewMode, isEditableText, saveFile]);

  if (!activeFile) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-4">
        <File size={40} className="text-[var(--color-text-muted)] mb-3" />
        <p className="text-sm text-[var(--color-text-secondary)]">
          {emptyHint}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border-default)] shrink-0">
        <FileTypeIcon fileType={fileType} />
        <span
          className="text-sm font-medium text-[var(--color-text-primary)] truncate flex-1"
          title={activeFile}
        >
          {getFileName(activeFile)}
          {isDirty && <span className="text-orange-500 ml-1">●</span>}
        </span>
        {fileType === "html" && (
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 px-2 text-xs",
                htmlViewMode === "preview" && "bg-[var(--color-surface-hover)]",
              )}
              onClick={() => setHtmlViewMode("preview")}
            >
              预览
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 px-2 text-xs",
                htmlViewMode === "source" && "bg-[var(--color-surface-hover)]",
              )}
              onClick={() => setHtmlViewMode("source")}
            >
              源码
            </Button>
          </div>
        )}
        {isDirty &&
          isEditableText &&
          (fileType !== "html" || htmlViewMode === "source") && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => saveFile()}
              disabled={isLoading}
              title="保存 (Ctrl+S)"
            >
              <Save size={14} />
            </Button>
          )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={closeFile}
          title="关闭"
        >
          <X size={14} />
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center flex-1 p-4 text-[var(--color-text-muted)]">
          <Loader2 size={20} className="animate-spin mr-2" />
          <span className="text-sm">加载中...</span>
        </div>
      )}

      {!isLoading && error && (
        <div className="p-4 text-sm text-[var(--color-danger)]">{error}</div>
      )}

      {!isLoading &&
        !error &&
        fileType === "html" &&
        content !== null &&
        htmlViewMode === "preview" && <HtmlPreview filePath={activeFile} />}

      {!isLoading &&
        !error &&
        fileType === "html" &&
        content !== null &&
        htmlViewMode === "source" && (
          <div className="flex-1 min-h-0">
            <MonacoCodeEditor
              path={activeFile}
              value={content}
              onChange={updateContent}
            />
          </div>
        )}

      {!isLoading && !error && fileType === "text" && content !== null && (
        <div className="flex-1 min-h-0">
          <MonacoCodeEditor
            path={activeFile}
            value={content}
            onChange={updateContent}
          />
        </div>
      )}

      {!isLoading &&
        !error &&
        fileType === "image" &&
        content !== null &&
        mimeType && (
          <div className="flex-1 p-3 overflow-auto flex items-start justify-center">
            <img
              src={`data:${mimeType};base64,${content}`}
              alt={getFileName(activeFile)}
              className="max-w-full h-auto rounded"
            />
          </div>
        )}

      {!isLoading && !error && fileType === "docx" && content !== null && (
        <DocxPreview content={content} />
      )}

      {!isLoading && !error && fileType === "pptx" && content !== null && (
        <PptxPreview content={content} />
      )}

      {!isLoading && !error && fileType === "xlsx" && content !== null && (
        <XlsxPreview content={content} />
      )}

      {!isLoading &&
        !error &&
        fileType === "pdf" &&
        content !== null &&
        mimeType && <PdfPreview content={content} mimeType={mimeType} />}

      {!isLoading && !error && fileType === "binary" && (
        <div className="flex flex-col items-center justify-center flex-1 p-4 text-center">
          <FileText size={32} className="text-[var(--color-text-muted)] mb-2" />
          <p className="text-sm text-[var(--color-text-secondary)]">
            此文件类型不支持预览
          </p>
        </div>
      )}
    </div>
  );
}
