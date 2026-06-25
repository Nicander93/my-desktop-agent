/**
 * 工作区下的对话列表
 *
 * 按 updatedAt 显示相对时间，支持选择、重命名和删除对话。
 */
import { useEffect, useState } from 'react';
import { Trash2, MoreHorizontal, Pencil } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';
import { useChatStore } from '@/stores/chatStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useGoToChat } from '@/hooks/useGoToChat';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface ConversationListProps {
  workspaceId: string;
}

function formatCompactTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

export function ConversationList({ workspaceId }: ConversationListProps) {
  const { sessions, currentSessionId, loadSessions, deleteSession, setCurrentSession, updateSession } = useSessionStore();
  const { loadMessages, clearMessages, setCurrentConversation } = useChatStore();
  const { currentWorkspaceId, selectWorkspace } = useWorkspaceStore();
  const goToChat = useGoToChat();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => {
    loadSessions(workspaceId);
  }, [workspaceId, loadSessions]);

  const workspaceSessions = sessions
    .filter((s) => s.workspaceId === workspaceId)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const handleSelectConversation = async (sessionId: string) => {
    if (editingId) return;
    goToChat();
    if (currentWorkspaceId !== workspaceId) {
      selectWorkspace(workspaceId);
      clearMessages();
    }
    setCurrentSession(sessionId);
    setCurrentConversation(sessionId);
    await loadMessages(sessionId);
  };

  const handleDelete = async (sessionId: string) => {
    if (confirm('确定要删除这个对话吗？')) {
      await deleteSession(sessionId);
      if (currentSessionId === sessionId) {
        clearMessages();
        setCurrentConversation(null);
      }
    }
  };

  const startRename = (sessionId: string, title: string) => {
    setEditingId(sessionId);
    setEditTitle(title);
  };

  const handleRename = async (sessionId: string) => {
    const title = editTitle.trim();
    const session = workspaceSessions.find((s) => s.id === sessionId);
    if (title && session && title !== session.title) {
      await updateSession(sessionId, { title });
    }
    setEditingId(null);
  };

  if (workspaceSessions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-0.5 py-1">
      {workspaceSessions.map((session) => (
        <div
          key={session.id}
          onClick={() => handleSelectConversation(session.id)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            startRename(session.id, session.title);
          }}
          className={cn(
            'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left transition-colors group cursor-pointer',
            currentSessionId === session.id
              ? 'bg-[var(--color-primary-100)] text-[var(--color-primary-700)]'
              : 'text-gray-600 hover:bg-gray-100'
          )}
        >
          {editingId === session.id ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={() => handleRename(session.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename(session.id);
                if (e.key === 'Escape') setEditingId(null);
              }}
              className="flex-1 bg-white border rounded px-1 py-0.5 text-sm min-w-0"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="flex-1 truncate">{session.title}</span>
          )}
          <span className="text-xs text-gray-400 flex-shrink-0">
            {formatCompactTime(session.updatedAt)}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 rounded flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal size={12} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => startRename(session.id, session.title)}>
                <Pencil size={12} className="mr-2" />重命名
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDelete(session.id)} className="text-red-600">
                <Trash2 size={12} className="mr-2" />删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
  );
}
