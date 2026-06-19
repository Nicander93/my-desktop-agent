import { create } from 'zustand';

interface UIState {
  sidebarCollapsed: boolean;
  toolPanelVisible: boolean;
  toolPanelTab: 'preview' | 'history' | 'diff';
  selectedFile: string | null;
  toggleSidebar: () => void;
  toggleToolPanel: () => void;
  setToolPanelTab: (tab: 'preview' | 'history' | 'diff') => void;
  setSelectedFile: (file: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toolPanelVisible: true,
  toolPanelTab: 'preview',
  selectedFile: null,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleToolPanel: () => set((state) => ({ toolPanelVisible: !state.toolPanelVisible })),
  setToolPanelTab: (tab) => set({ toolPanelTab: tab }),
  setSelectedFile: (file) => set({ selectedFile: file })
}));