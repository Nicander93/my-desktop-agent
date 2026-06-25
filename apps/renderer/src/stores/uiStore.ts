import { create } from 'zustand';

const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 480;
const TOOL_PANEL_MIN_WIDTH = 240;
const TOOL_PANEL_MAX_WIDTH = 600;

interface UIState {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  toolPanelVisible: boolean;
  toolPanelWidth: number;
  toolPanelTab: 'explorer' | 'preview' | 'history' | 'diff';
  toggleSidebar: () => void;
  adjustSidebarWidth: (delta: number) => void;
  toggleToolPanel: () => void;
  adjustToolPanelWidth: (delta: number) => void;
  setToolPanelTab: (tab: 'explorer' | 'preview' | 'history' | 'diff') => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  sidebarWidth: 240,
  toolPanelVisible: true,
  toolPanelWidth: 320,
  toolPanelTab: 'explorer',
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  adjustSidebarWidth: (delta) => set((state) => ({
    sidebarWidth: Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, state.sidebarWidth + delta)),
  })),
  toggleToolPanel: () => set((state) => ({ toolPanelVisible: !state.toolPanelVisible })),
  adjustToolPanelWidth: (delta) => set((state) => ({
    toolPanelWidth: Math.min(TOOL_PANEL_MAX_WIDTH, Math.max(TOOL_PANEL_MIN_WIDTH, state.toolPanelWidth - delta)),
  })),
  setToolPanelTab: (tab) => set({ toolPanelTab: tab }),
}));