/**
 * 单个工作区项
 *
 * 支持展开/收起、重命名、删除。
 * 展开且激活时显示 ConversationList。
 */
import { useEffect, useState } from 'react';
import { Folder, ChevronRight, MoreHorizontal, Pencil, Trash2, Plus } from 'lucide-react';
import { Workspace, useWorkspaceStore } from '@/stores/workspaceStore';
import { useNewConversation } from '@/hooks/useNewConversation';
import { ConversationList } from './ConversationList';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface WorkspaceItemProps {
  workspace: Workspace;
  isActive: boolean;
}

export function WorkspaceItem({ workspace, isActive }: WorkspaceItemProps) {
  const [expanded, setExpanded] = useState(isActive);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(workspace.name);
  const { updateWorkspace, deleteWorkspace } = useWorkspaceStore();
  const startNewConversation = useNewConversation();

  useEffect(() => {
    if (isActive) setExpanded(true);
  }, [isActive]);

  const handleToggleExpand = () => {
    setExpanded((prev) => !prev);
  };

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleToggleExpand();
  };

  const handleCreateConversation = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(true);
    await startNewConversation(workspace.id);
  };

  const handleRename = async () => {
    if (editName.trim() && editName !== workspace.name) {
      await updateWorkspace(workspace.id, { name: editName.trim() });
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (confirm(`确定要删除工作区 "${workspace.name}" 吗？所有对话将被删除。`)) {
      await deleteWorkspace(workspace.id);
    }
  };

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors',
          isActive ? 'bg-[var(--color-primary-50)] text-[var(--color-primary-700)]' : 'text-gray-600 hover:bg-gray-100'
        )}
        onClick={handleToggleExpand}
      >
        <button onClick={handleExpand} className="p-0.5 hover:bg-gray-200 rounded">
          <ChevronRight size={14} className={cn('transition-transform', expanded && 'rotate-90')} />
        </button>
        <Folder size={16} style={{ color: workspace.color }} />

        {isEditing ? (
          <input
            type="text" value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setIsEditing(false); }}
            className="flex-1 bg-white border rounded px-1 py-0.5 text-sm"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="flex-1 truncate"
            onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
            title="双击重命名"
          >
            {workspace.name}
          </span>
        )}

        <button
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded"
          onClick={handleCreateConversation}
          title="新建对话"
        >
          <Plus size={14} />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger>
            <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setIsEditing(true)}>
              <Pencil size={14} className="mr-2" />重命名
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDelete} className="text-red-600">
              <Trash2 size={14} className="mr-2" />删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {expanded && (
        <div className="ml-4">
          <ConversationList workspaceId={workspace.id} />
        </div>
      )}
    </div>
  );
}
