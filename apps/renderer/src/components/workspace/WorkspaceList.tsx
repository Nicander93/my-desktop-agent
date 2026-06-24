import { useEffect, useState } from 'react';
import { FolderPlus, Folder } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useChatStore } from '@/stores/chatStore';
import { WorkspaceItem } from './WorkspaceItem';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';
import { Button } from '@/components/ui/button';

interface WorkspaceListProps {
  collapsed: boolean;
}

export function WorkspaceList({ collapsed }: WorkspaceListProps) {
  const { workspaces, currentWorkspaceId, selectWorkspace, loadWorkspaces, isLoading } = useWorkspaceStore();
  const { setCurrentSession } = useSessionStore();
  const { clearMessages, setCurrentConversation } = useChatStore();
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const handleSelectWorkspace = (id: string) => {
    selectWorkspace(id);
    setCurrentSession(null);
    clearMessages();
    setCurrentConversation(null);
  };

  if (collapsed) {
    return (
      <div className="space-y-1">
        {workspaces.slice(0, 5).map((workspace) => (
          <button
            key={workspace.id}
            onClick={() => handleSelectWorkspace(workspace.id)}
            className={cn(
              'w-full flex items-center justify-center p-2 rounded-lg transition-colors',
              currentWorkspaceId === workspace.id
                ? 'bg-[var(--color-primary-100)] text-[var(--color-primary-700)]'
                : 'text-gray-600 hover:bg-gray-100'
            )}
            title={workspace.name}
          >
            <Folder size={20} style={{ color: workspace.color }} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-3">
        <p className="text-xs font-medium text-gray-400 uppercase">工作区</p>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDialogOpen(true)}>
          <FolderPlus size={14} />
        </Button>
      </div>

      {isLoading ? (
        <div className="px-3 py-2 text-sm text-gray-400">加载中...</div>
      ) : workspaces.length === 0 ? (
        <div className="px-3 py-2 text-sm text-gray-400">暂无工作区，点击 + 创建</div>
      ) : (
        <div className="space-y-1">
          {workspaces.map((workspace) => (
            <WorkspaceItem
              key={workspace.id}
              workspace={workspace}
              isActive={currentWorkspaceId === workspace.id}
              onClick={() => handleSelectWorkspace(workspace.id)}
            />
          ))}
        </div>
      )}

      <CreateWorkspaceDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}
