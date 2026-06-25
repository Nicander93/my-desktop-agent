/**
 * 工作区下的对话列表
 *
 * 按 updatedAt 显示相对时间，支持选择和删除对话。
 */
import { useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';
import { useChatStore } from '@/stores/chatStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useGoToChat } from '@/hooks/useGoToChat';
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
  const { sessions, currentSessionId, loadSessions, deleteSession, setCurrentSession } = useSessionStore();
  const { loadMessages, clearMessages, setCurrentConversation } = useChatStore();
  const { currentWorkspaceId, selectWorkspace } = useWorkspaceStore();
  const goToChat = useGoToChat();

  useEffect(() => {
    loadSessions(workspaceId);
  }, [workspaceId, loadSessions]);

  const handleSelectConversation = async (sessionId: string) => {
    goToChat();
    if (currentWorkspaceId !== workspaceId) {
      selectWorkspace(workspaceId);
      clearMessages();
    }
    setCurrentSession(sessionId);
    setCurrentConversation(sessionId);
    await loadMessages(sessionId);
  };

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (confirm('确定要删除这个对话吗？')) {
      await deleteSession(sessionId);
      if (currentSessionId === sessionId) {
        clearMessages();
        setCurrentConversation(null);
      }
    }
  };

  if (sessions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-0.5 py-1">
      {sessions.map((session) => (
        <button
          key={session.id}
          onClick={() => handleSelectConversation(session.id)}
          className={cn(
            'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left transition-colors group',
            currentSessionId === session.id
              ? 'bg-[var(--color-primary-100)] text-[var(--color-primary-700)]'
              : 'text-gray-600 hover:bg-gray-100'
          )}
        >
          <span className="flex-1 truncate">{session.title}</span>
          <span className="text-xs text-gray-400 flex-shrink-0">
            {formatCompactTime(session.updatedAt)}
          </span>
          <button
            onClick={(e) => handleDelete(e, session.id)}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 rounded flex-shrink-0"
          >
            <Trash2 size={12} />
          </button>
        </button>
      ))}
    </div>
  );
}
