/**
 * 对话（Session）状态管理
 *
 * Session 对应主进程 Conversation，id 同时作为 Agent sessionId
 */
import { create } from 'zustand';

export interface Session {
  id: string;
  workspaceId: string;
  title: string;
  model?: string;
  createdAt: number;
  updatedAt: number;
}

interface SessionState {
  sessions: Session[];
  currentSessionId: string | null;
  isLoading: boolean;
  loadSessions: (workspaceId: string) => Promise<void>;
  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
  setCurrentSession: (id: string | null) => void;
  updateSession: (id: string, updates: Partial<Session>) => Promise<void>;
  createSession: (workspaceId: string, title?: string, model?: string) => Promise<Session | null>;
  deleteSession: (id: string) => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  currentSessionId: null,
  isLoading: false,

  loadSessions: async (workspaceId) => {
    set({ isLoading: true });
    try {
      const result = await window.electronAPI?.conversation.getAll(workspaceId);
      if (result?.success && result.conversations) {
        const sessions = result.conversations.map((c: any) => ({
          id: c.id, workspaceId: c.workspaceId, title: c.title,
          model: c.model, createdAt: c.createdAt, updatedAt: c.updatedAt
        }));
        set((state) => ({
          sessions: [
            ...state.sessions.filter((s) => s.workspaceId !== workspaceId),
            ...sessions,
          ],
          isLoading: false,
        }));
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      set({ isLoading: false });
    }
  },

  addSession: (session) => set((state) => ({ sessions: [session, ...state.sessions] })),

  removeSession: (id) => set((state) => ({ sessions: state.sessions.filter(s => s.id !== id) })),

  setCurrentSession: (id) => set({ currentSessionId: id }),

  updateSession: async (id, updates) => {
    try {
      const result = await window.electronAPI?.conversation.update(id, updates);
      if (result?.success) {
        set((state) => ({
          sessions: state.sessions.map(s => s.id === id ? { ...s, ...updates } : s)
        }));
      }
    } catch (error) {
      console.error('Failed to update session:', error);
    }
  },

  /**
   * 创建对话并在主进程预建 Agent session
   * Agent 会绑定工作区 cwd 和 workspaceId
   */
  createSession: async (workspaceId, title, model) => {
    try {
      const result = await window.electronAPI?.conversation.create(workspaceId, title, model);
      if (result?.success && result.conversation) {
        const session: Session = {
          id: result.conversation.id, workspaceId: result.conversation.workspaceId,
          title: result.conversation.title, model: result.conversation.model,
          createdAt: result.conversation.createdAt, updatedAt: result.conversation.updatedAt
        };
        set((state) => ({ sessions: [session, ...state.sessions], currentSessionId: session.id }));
        await window.electronAPI?.agent.createSession(session.id);
        return session;
      }
      return null;
    } catch (error) {
      console.error('Failed to create session:', error);
      return null;
    }
  },

  /** 删除对话并关闭对应 Agent session */
  deleteSession: async (id) => {
    try {
      const result = await window.electronAPI?.conversation.delete(id);
      if (result?.success) {
        await window.electronAPI?.agent.closeSession(id);
        set((state) => ({
          sessions: state.sessions.filter(s => s.id !== id),
          currentSessionId: state.currentSessionId === id ? null : state.currentSessionId
        }));
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }
}));
