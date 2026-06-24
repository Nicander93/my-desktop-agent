import { useState } from 'react';
import { Folder, ChevronRight, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Workspace, useWorkspaceStore } from '@/stores/workspaceStore';
import { ConversationList } from './ConversationList';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface WorkspaceItemProps {
  workspace: Workspace;
  isActive: boolean;
  onClick: () => void;
}

export function WorkspaceItem({ workspace, isActive, onClick }: WorkspaceItemProps) {
  const [expanded, setExpanded] = useState(isActive);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(workspace.name);
  const { updateWorkspace, deleteWorkspace } = useWorkspaceStore();

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
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
        onClick={onClick}
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
          <span className="flex-1 truncate">{workspace.name}</span>
        )}

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

      {expanded && isActive && (
        <div className="ml-4">
          <ConversationList workspaceId={workspace.id} />
        </div>
      )}
    </div>
  );
}
