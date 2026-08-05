/** @ 触发的文件选择浮层 */
import { Folder, File } from "lucide-react";
import type { FileSearchResult } from "@desktop-agent/shared";
import { cn } from "@/lib/utils";

/**
 * 文件提及补全的搜索结果、键盘选中项和选择回调。
 */
interface FileMentionPickerProps {
  results: FileSearchResult[];
  selectedIndex: number;
  loading?: boolean;
  onSelect: (relativePath: string) => void;
}

/** 工作区文件搜索结果列表 */
/**
 * 在输入框上方显示工作区文件搜索结果，并用 mousedown 避免输入框先失焦。
 */
export function FileMentionPicker({
  results,
  selectedIndex,
  loading,
  onSelect,
}: FileMentionPickerProps) {
  if (loading && results.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-2 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-panel)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
        搜索中…
      </div>
    );
  }

  if (results.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-panel)] overflow-hidden max-h-64 overflow-y-auto">
      {results.map((item, index) => (
        <button
          key={item.path}
          type="button"
          className={cn(
            "w-full px-3 py-2 text-left hover:bg-[var(--color-surface-hover)] flex items-center gap-2 min-w-0",
            index === selectedIndex && "bg-[var(--color-surface-hover)]",
          )}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(item.relativePath);
          }}
        >
          {item.isDirectory ? (
            <Folder size={16} className="shrink-0 text-amber-500" />
          ) : (
            <File
              size={16}
              className="shrink-0 text-[var(--color-text-muted)]"
            />
          )}
          <span className="text-sm text-[var(--color-text-primary)] truncate font-mono">
            {item.relativePath}
          </span>
        </button>
      ))}
    </div>
  );
}
