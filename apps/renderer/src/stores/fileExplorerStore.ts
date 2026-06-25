import { create } from 'zustand';
import type { FileEntry } from '@desktop-agent/shared';
import { useWorkspaceStore } from './workspaceStore';
import { useEditorStore } from './editorStore';

interface FileExplorerState {
  rootPath: string | null;
  childrenMap: Record<string, FileEntry[]>;
  expandedPaths: Record<string, boolean>;
  loadingPaths: Record<string, boolean>;
  selectedPath: string | null;
  error: string | null;

  initExplorer: () => Promise<void>;
  loadDir: (path: string) => Promise<void>;
  toggleExpand: (path: string) => Promise<void>;
  selectPath: (path: string) => void;
  openFile: (path: string) => Promise<void>;
  reset: () => void;
}

export const useFileExplorerStore = create<FileExplorerState>((set, get) => ({
  rootPath: null,
  childrenMap: {},
  expandedPaths: {},
  loadingPaths: {},
  selectedPath: null,
  error: null,

  reset: () => {
    set({
      rootPath: null,
      childrenMap: {},
      expandedPaths: {},
      loadingPaths: {},
      selectedPath: null,
      error: null,
    });
  },

  initExplorer: async () => {
    const { currentWorkspaceId, workspaces } = useWorkspaceStore.getState();
    const workspace = workspaces.find((w) => w.id === currentWorkspaceId);

    if (!workspace) {
      get().reset();
      return;
    }

    set({
      rootPath: workspace.path,
      childrenMap: {},
      expandedPaths: {},
      loadingPaths: {},
      selectedPath: null,
      error: null,
    });

    await get().loadDir(workspace.path);
    set((state) => ({
      expandedPaths: { ...state.expandedPaths, [workspace.path]: true },
    }));
  },

  loadDir: async (path: string) => {
    const workspaceId = useWorkspaceStore.getState().currentWorkspaceId;
    if (!workspaceId) return;

    set((state) => ({
      loadingPaths: { ...state.loadingPaths, [path]: true },
      error: null,
    }));

    try {
      const result = await window.electronAPI?.workspaceFs.readDir(workspaceId, path);
      if (!result?.success || !result.entries) {
        set((state) => ({
          loadingPaths: { ...state.loadingPaths, [path]: false },
          error: result?.error || '读取目录失败',
        }));
        return;
      }

      set((state) => ({
        childrenMap: { ...state.childrenMap, [path]: result.entries! },
        loadingPaths: { ...state.loadingPaths, [path]: false },
      }));
    } catch (error) {
      set((state) => ({
        loadingPaths: { ...state.loadingPaths, [path]: false },
        error: error instanceof Error ? error.message : '读取目录失败',
      }));
    }
  },

  toggleExpand: async (path: string) => {
    const { expandedPaths, childrenMap } = get();
    if (expandedPaths[path]) {
      set({ expandedPaths: { ...expandedPaths, [path]: false } });
      return;
    }

    if (!childrenMap[path]) {
      await get().loadDir(path);
    }
    set((state) => ({
      expandedPaths: { ...state.expandedPaths, [path]: true },
    }));
  },

  selectPath: (path: string) => {
    set({ selectedPath: path });
  },

  openFile: async (path: string) => {
    get().selectPath(path);
    await useEditorStore.getState().openFile(path);
  },
}));
