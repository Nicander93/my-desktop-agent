import { create } from 'zustand';

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

interface SessionState {
  sessions: Session[];
  currentSessionId: string | null;
  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
  setCurrentSession: (id: string | null) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  currentSessionId: null,
  addSession: (session) => set((state) => ({ sessions: [...state.sessions, session] })),
  removeSession: (id) => set((state) => ({ sessions: state.sessions.filter(s => s.id !== id) })),
  setCurrentSession: (id) => set({ currentSessionId: id }),
  updateSession: (id, updates) => set((state) => ({
    sessions: state.sessions.map(s => s.id === id ? { ...s, ...updates } : s)
  }))
}));