import { useCallback } from 'react';
import { useSessionStore } from '@/stores/sessionStore';
import { useChatStore } from '@/stores/chatStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useGoToChat } from './useGoToChat';

export function useNewConversation() {
  const goToChat = useGoToChat();

  return useCallback(async (workspaceId?: string) => {
    goToChat();

    const { currentWorkspaceId, selectWorkspace } = useWorkspaceStore.getState();
    const targetWorkspaceId = workspaceId ?? currentWorkspaceId;
    if (!targetWorkspaceId) return;

    const { currentSessionId, sessions, createSession, setCurrentSession } = useSessionStore.getState();
    const { messages, clearMessages, setCurrentConversation } = useChatStore.getState();

    if (targetWorkspaceId !== currentWorkspaceId) {
      selectWorkspace(targetWorkspaceId);
      setCurrentSession(null);
      clearMessages();
      setCurrentConversation(null);
    }

    const workspaceSessions = sessions.filter((s) => s.workspaceId === targetWorkspaceId);

    if (
      targetWorkspaceId === currentWorkspaceId &&
      currentSessionId &&
      workspaceSessions.some((s) => s.id === currentSessionId) &&
      messages.length === 0
    ) {
      return;
    }

    const session = await createSession(targetWorkspaceId);
    if (session) {
      clearMessages();
      setCurrentConversation(session.id);
    }
  }, [goToChat]);
}
