import { ChevronRight, ChevronDown, Folder, FolderOpen, File, Loader2 } from 'lucide-react';
import type { FileEntry } from '@desktop-agent/shared';
import { useFileExplorerStore } from '@/stores/fileExplorerStore';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/lib/utils';

interface FileTreeNodeProps {
  entry: FileEntry;
  depth: number;
}

export function FileTreeNode({ entry, depth }: FileTreeNodeProps) {
  const {
    expandedPaths,
    childrenMap,
    loadingPaths,
    toggleExpand,
    openFile,
  } = useFileExplorerStore();
  const activeFile = useEditorStore((s) => s.activeFile);

  const isExpanded = !!expandedPaths[entry.path];
  const children = childrenMap[entry.path];
  const isLoading = !!loadingPaths[entry.path];
  const paddingLeft = 8 + depth * 12;

  if (entry.isDirectory) {
    return (
      <div>
        <button
          type="button"
          onClick={() => toggleExpand(entry.path)}
          className="w-full flex items-center gap-1 py-1 pr-2 text-xs text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          style={{ paddingLeft }}
        >
          {isLoading ? (
            <Loader2 size={14} className="shrink-0 animate-spin text-gray-400" />
          ) : isExpanded ? (
            <ChevronDown size={14} className="shrink-0 text-gray-400" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-gray-400" />
          )}
          {isExpanded ? (
            <FolderOpen size={14} className="shrink-0 text-amber-500" />
          ) : (
            <Folder size={14} className="shrink-0 text-amber-500" />
          )}
          <span className="truncate">{entry.name}</span>
        </button>
        {isExpanded && children?.map((child) => (
          <FileTreeNode key={child.path} entry={child} depth={depth + 1} />
        ))}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => openFile(entry.path)}
      className={cn(
        'w-full flex items-center gap-1.5 py-1 pr-2 text-xs text-gray-600 hover:bg-gray-100 rounded-md transition-colors',
        activeFile === entry.path && 'bg-[var(--color-primary-100)] text-[var(--color-primary-700)]'
      )}
      style={{ paddingLeft: paddingLeft + 18 }}
      title={entry.path}
    >
      <File size={14} className="shrink-0 text-gray-400" />
      <span className="truncate">{entry.name}</span>
    </button>
  );
}
