import { useEffect } from 'react';
import { FolderTree, RefreshCw, Loader2 } from 'lucide-react';
import { useFileExplorerStore } from '@/stores/fileExplorerStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { FileTreeNode } from './FileTreeNode';
import { Button } from '@/components/ui/button';

function getDirName(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export function FileExplorer() {
  const { currentWorkspaceId, workspaces } = useWorkspaceStore();
  const workspace = workspaces.find((w) => w.id === currentWorkspaceId);
  const {
    rootPath,
    childrenMap,
    expandedPaths,
    loadingPaths,
    error,
    initExplorer,
  } = useFileExplorerStore();

  useEffect(() => {
    if (currentWorkspaceId) {
      initExplorer();
    } else {
      useFileExplorerStore.getState().reset();
    }
  }, [currentWorkspaceId, initExplorer]);

  if (!workspace || !rootPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-4">
        <FolderTree size={48} className="text-gray-300 mb-3" />
        <p className="text-sm text-gray-500">请先选择工作区</p>
        <p className="text-xs text-gray-400 mt-1">选择后可浏览仓库目录</p>
      </div>
    );
  }

  const rootEntries = childrenMap[rootPath] ?? [];
  const isRootLoading = !!loadingPaths[rootPath];

  return (
    <div className="flex flex-col h-full min-h-[200px]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 shrink-0">
        <FolderTree size={14} className="text-[var(--color-primary-500)] shrink-0" />
        <span className="text-xs font-medium text-gray-700 truncate flex-1" title={rootPath}>
          {getDirName(rootPath)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => initExplorer()}
          disabled={isRootLoading}
          title="刷新"
        >
          <RefreshCw size={14} className={isRootLoading ? 'animate-spin' : ''} />
        </Button>
      </div>

      {error && (
        <p className="px-3 py-2 text-xs text-red-600">{error}</p>
      )}

      {isRootLoading && rootEntries.length === 0 ? (
        <div className="flex items-center justify-center flex-1 p-4 text-gray-400">
          <Loader2 size={18} className="animate-spin mr-2" />
          <span className="text-sm">加载目录...</span>
        </div>
      ) : (
        <div className="flex-1 overflow-auto py-1">
          {expandedPaths[rootPath] !== false && rootEntries.map((entry) => (
            <FileTreeNode key={entry.path} entry={entry} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}
