import { useEffect } from 'react';
import { MessageSquarePlus, MessageSquare, Trash2 } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';
import { useChatStore } from '@/stores/chatStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ConversationListProps {
  workspaceId: string;
}

export function ConversationList({ workspaceId }: ConversationListProps) {
  const { sessions, currentSessionId, loadSessions, createSession, deleteSession, setCurrentSession } = useSessionStore();
  const { loadMessages, clearMessages } = useChatStore();

  useEffect(() => {
    loadSessions(workspaceId);
  }, [workspaceId, loadSessions]);

  const handleCreateConversation = async () => {
    const session = await createSession(workspaceId);
    if (session) {
      clearMessages();
    }
  };

  const handleSelectConversation = async (sessionId: string) => {
    setCurrentSession(sessionId);
    await loadMessages(sessionId);
  };

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (confirm('确定要删除这个对话吗？')) {
      await deleteSession(sessionId);
      if (currentSessionId === sessionId) {
        clearMessages();
      }
    }
  };

  return (
    <div className="space-y-1 py-2">
      <div className="flex items-center justify-between px-3 mb-2">
        <p className="text-xs font-medium text-gray-400">对话</p>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCreateConversation}>
          <MessageSquarePlus size={14} />
        </Button>
      </div>

      {sessions.length === 0 ? (
        <p className="px-3 text-sm text-gray-400">暂无对话</p>
      ) : (
        <div className="space-y-0.5">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => handleSelectConversation(session.id)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-left transition-colors group',
                currentSessionId === session.id
                  ? 'bg-[var(--color-primary-100)] text-[var(--color-primary-700)]'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              <MessageSquare size={14} className="flex-shrink-0" />
              <span className="flex-1 truncate">{session.title}</span>
              <button
                onClick={(e) => handleDelete(e, session.id)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded"
              >
                <Trash2 size={12} />
              </button>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
