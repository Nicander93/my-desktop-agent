/** 工作区文件树 + 右侧编辑区 */
import { useEffect } from 'react';
import { FolderTree, RefreshCw, Loader2 } from 'lucide-react';
import { useFileExplorerStore } from '@/stores/fileExplorerStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { FileTreeNode } from './FileTreeNode';
import { FileEditorPane } from './FileEditorPane';
import { Button } from '@/components/ui/button';

function getDirName(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

/** 目录浏览与文件打开 */
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
        <FolderTree size={48} className="text-[var(--color-text-muted)] mb-3" />
        <p className="text-sm text-[var(--color-text-secondary)]">请先选择工作区</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">选择后可浏览仓库目录</p>
      </div>
    );
  }

  const rootEntries = childrenMap[rootPath] ?? [];
  const isRootLoading = !!loadingPaths[rootPath];

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[180px] shrink-0 flex flex-col border-r border-[var(--color-border-default)] min-h-0">
        <div className="flex items-center gap-2 px-2 py-2 border-b border-[var(--color-border-default)] shrink-0">
          <FolderTree size={14} className="text-[var(--color-primary-500)] shrink-0" />
          <span className="text-xs font-medium text-[var(--color-text-primary)] truncate flex-1" title={rootPath}>
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
          <p className="px-2 py-2 text-xs text-[var(--color-danger)]">{error}</p>
        )}

        {isRootLoading && rootEntries.length === 0 ? (
          <div className="flex items-center justify-center flex-1 p-4 text-[var(--color-text-muted)]">
            <Loader2 size={18} className="animate-spin mr-2" />
            <span className="text-sm">加载目录...</span>
          </div>
        ) : (
          <div className="flex-1 overflow-auto py-1 min-h-0">
            {expandedPaths[rootPath] !== false && rootEntries.map((entry) => (
              <FileTreeNode key={entry.path} entry={entry} depth={0} />
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 min-h-0">
        <FileEditorPane />
      </div>
    </div>
  );
}
