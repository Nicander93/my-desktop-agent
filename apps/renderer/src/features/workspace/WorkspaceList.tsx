/**
 * 侧边栏工作区列表
 *
 * 展示所有工作区，支持折叠模式下的图标视图。
 * 切换工作区时会清空当前对话和消息状态。
 */
import { useEffect, useState } from 'react';
import { FolderPlus, Folder } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useChatStore } from '@/stores/chatStore';
import { useGoToChat } from '@/hooks/useGoToChat';
import { WorkspaceItem } from './WorkspaceItem';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface WorkspaceListProps {
  collapsed: boolean;
}

export function WorkspaceList({ collapsed }: WorkspaceListProps) {
  const { workspaces, currentWorkspaceId, selectWorkspace, loadWorkspaces, isLoading } = useWorkspaceStore();
  const { setCurrentSession } = useSessionStore();
  const { clearMessages, setCurrentConversation } = useChatStore();
  const goToChat = useGoToChat();
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  /** 切换工作区：重置对话和聊天状态 */
  const handleSelectWorkspace = (id: string) => {
    goToChat();
    selectWorkspace(id);
    setCurrentSession(null);
    clearMessages();
    setCurrentConversation(null);
  };

  if (collapsed) {
    return (
      <div className="space-y-1 px-1">
        {workspaces.slice(0, 5).map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            onClick={() => handleSelectWorkspace(workspace.id)}
            className={cn(
              'w-full flex items-center justify-center p-2 rounded-[var(--radius-md)] transition-colors',
              currentWorkspaceId === workspace.id
                ? 'bg-[var(--color-primary-50)] text-[var(--color-primary-700)]'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
            )}
            title={workspace.name}
          >
            <Folder size={20} style={{ color: workspace.color }} />
          </button>
        ))}
        <Button
          variant="ghost"
          size="icon"
          className="w-full"
          onClick={() => setDialogOpen(true)}
          aria-label="创建工作区"
        >
          <FolderPlus size={18} />
        </Button>
        <CreateWorkspaceDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="app-sidebar__section-label !px-2 !pt-0">工作区</p>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setDialogOpen(true)}
          aria-label="创建工作区"
        >
          <FolderPlus size={14} />
        </Button>
      </div>

      {isLoading ? (
        <div className="px-3 py-2 text-sm text-[var(--color-text-muted)]">加载中...</div>
      ) : workspaces.length === 0 ? (
        <div className="px-3 py-2 text-sm text-[var(--color-text-muted)]">暂无工作区，点击 + 创建</div>
      ) : (
        <div className="space-y-1">
          {workspaces.map((workspace) => (
            <WorkspaceItem
              key={workspace.id}
              workspace={workspace}
              isActive={currentWorkspaceId === workspace.id}
            />
          ))}
        </div>
      )}

      <CreateWorkspaceDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
