/**
 * 工作区状态管理
 *
 * 对应主进程 workspaceService，管理当前选中的工作区
 */
import { create } from 'zustand';

export interface Workspace {
  id: string;
  name: string;
  path: string;
  description: string;
  icon: string;
  color: string;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
}

interface WorkspaceState {
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  isLoading: boolean;
  error: string | null;
  loadWorkspaces: () => Promise<void>;
  createWorkspace: (name: string, description?: string) => Promise<Workspace | null>;
  createWorkspaceFromPath: (name: string, path: string, description?: string) => Promise<Workspace | null>;
  selectWorkspace: (id: string | null) => void;
  updateWorkspace: (id: string, updates: Partial<Pick<Workspace, 'name' | 'description' | 'icon' | 'color'>>) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [],
  currentWorkspaceId: null,
  isLoading: false,
  error: null,

  loadWorkspaces: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI?.workspace.getAll();
      if (result?.success) {
        set({ workspaces: result.workspaces, isLoading: false });
      } else {
        set({ error: result?.error || 'Failed to load workspaces', isLoading: false });
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Unknown error', isLoading: false });
    }
  },

  createWorkspace: async (name, description) => {
    try {
      const result = await window.electronAPI?.workspace.create(name, description);
      if (result?.success && result.workspace) {
        set((state) => ({ workspaces: [result.workspace!, ...state.workspaces] }));
        return result.workspace;
      }
      return null;
    } catch (error) {
      console.error('Failed to create workspace:', error);
      return null;
    }
  },

  createWorkspaceFromPath: async (name, path, description) => {
    try {
      const result = await window.electronAPI?.workspace.createFromPath(name, path, description);
      if (result?.success && result.workspace) {
        set((state) => ({ workspaces: [result.workspace!, ...state.workspaces] }));
        return result.workspace;
      }
      return null;
    } catch (error) {
      console.error('Failed to create workspace:', error);
      return null;
    }
  },

  /** 选中工作区并更新最近访问时间 */
  selectWorkspace: (id) => {
    set({ currentWorkspaceId: id });
    if (id) { window.electronAPI?.workspace.touch(id); }
  },
  
  updateWorkspace: async (id, updates) => {
    try {
      const result = await window.electronAPI?.workspace.update(id, updates);
      if (result?.success && result.workspace) {
        set((state) => ({
          workspaces: state.workspaces.map(w => w.id === id ? result.workspace! : w)
        }));
      }
    } catch (error) {
      console.error('Failed to update workspace:', error);
    }
  },

  deleteWorkspace: async (id) => {
    try {
      const result = await window.electronAPI?.workspace.delete(id);
      if (result?.success) {
        set((state) => ({
          workspaces: state.workspaces.filter(w => w.id !== id),
          currentWorkspaceId: state.currentWorkspaceId === id ? null : state.currentWorkspaceId
        }));
      }
    } catch (error) {
      console.error('Failed to delete workspace:', error);
    }
  }
}));
