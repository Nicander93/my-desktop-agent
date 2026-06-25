import { create } from 'zustand';
import { useWorkspaceStore } from './workspaceStore';
import { useUIStore } from './uiStore';
import { useFileExplorerStore } from './fileExplorerStore';
import { resolveEditorFileType } from '@/lib/fileTypeUtils';

export type EditorFileType = 'text' | 'image' | 'docx' | 'pptx' | 'xlsx' | 'pdf' | 'binary';

interface EditorState {
  activeFile: string | null;
  content: string | null;
  savedContent: string | null;
  fileType: EditorFileType;
  mimeType: string | null;
  isDirty: boolean;
  isLoading: boolean;
  error: string | null;

  openFile: (path: string) => Promise<void>;
  updateContent: (content: string) => void;
  saveFile: () => Promise<void>;
  closeFile: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  activeFile: null,
  content: null,
  savedContent: null,
  fileType: 'text',
  mimeType: null,
  isDirty: false,
  isLoading: false,
  error: null,

  openFile: async (path: string) => {
    const workspaceId = useWorkspaceStore.getState().currentWorkspaceId;
    if (!workspaceId) {
      set({ error: '请先选择工作区', isLoading: false });
      return;
    }

    set({ isLoading: true, error: null, activeFile: path });

    try {
      const result = await window.electronAPI?.workspaceFs.read(workspaceId, path);
      if (!result?.success || !result.file) {
        set({
          isLoading: false,
          error: result?.error || '读取文件失败',
        });
        return;
      }

      const fileType = resolveEditorFileType(path, result.file.mimeType, result.file.encoding);
      useUIStore.getState().setToolPanelTab('explorer');
      useFileExplorerStore.getState().selectPath(path);

      set({
        content: result.file.content,
        savedContent: result.file.content,
        fileType,
        mimeType: result.file.mimeType,
        isDirty: false,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : '读取文件失败',
      });
    }
  },

  updateContent: (content: string) => {
    const { savedContent } = get();
    set({
      content,
      isDirty: content !== savedContent,
    });
  },

  saveFile: async () => {
    const { activeFile, content, fileType } = get();
    if (!activeFile || content === null || fileType !== 'text') return;

    const workspaceId = useWorkspaceStore.getState().currentWorkspaceId;
    if (!workspaceId) {
      set({ error: '请先选择工作区' });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const result = await window.electronAPI?.workspaceFs.write(workspaceId, activeFile, content);
      if (!result?.success) {
        set({ isLoading: false, error: result?.error || '保存失败' });
        return;
      }

      set({
        savedContent: content,
        isDirty: false,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : '保存失败',
      });
    }
  },

  closeFile: () => {
    set({
      activeFile: null,
      content: null,
      savedContent: null,
      fileType: 'text',
      mimeType: null,
      isDirty: false,
      isLoading: false,
      error: null,
    });
  },
}));
