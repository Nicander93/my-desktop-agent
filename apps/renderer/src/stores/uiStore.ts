/**
 * 布局 UI 状态：侧栏/工具面板显隐与宽度、Tab、主题
 */
import { create } from "zustand";

const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 480;
const TOOL_PANEL_MIN_WIDTH = 320;
const TOOL_PANEL_MAX_WIDTH = 900;

const THEME_STORAGE_KEY = "desktop-agent-theme";

/**
 * 用户可选择的显式主题或跟随系统偏好。
 */
export type ThemePreference = "light" | "dark" | "system";
/**
 * 右侧工具面板可以显示的一级页面。
 */
export type ToolPanelTab = "task" | "files" | "preview" | "changes";

/**
 * 从浏览器存储读取已验证主题；存储不可用或值无效时回退 system。
 */
function readStoredTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system")
      return value;
  } catch {
    /* ignore */
  }
  return "system";
}

/**
 * 将 system 偏好解析为当前媒体查询对应的实际主题。
 */
function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "light" || preference === "dark") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * 将主题偏好应用到 document 根节点并返回实际生效的明暗主题。
 */
export function applyThemeToDocument(
  preference: ThemePreference,
): "light" | "dark" {
  const resolved = resolveTheme(preference);
  document.documentElement.setAttribute("data-theme", resolved);
  return resolved;
}

/**
 * 侧栏、工具面板与主题的纯渲染进程布局状态及变更操作。
 */
interface UIState {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  toolPanelVisible: boolean;
  toolPanelWidth: number;
  toolPanelTab: ToolPanelTab;
  theme: ThemePreference;
  resolvedTheme: "light" | "dark";
  toggleSidebar: () => void;
  adjustSidebarWidth: (delta: number) => void;
  toggleToolPanel: () => void;
  adjustToolPanelWidth: (delta: number) => void;
  setToolPanelTab: (tab: ToolPanelTab) => void;
  openTracePanel: () => void;
  setTheme: (theme: ThemePreference) => void;
  syncResolvedTheme: () => void;
}

const initialTheme =
  typeof window !== "undefined" ? readStoredTheme() : "system";
const initialResolved =
  typeof window !== "undefined" ? applyThemeToDocument(initialTheme) : "light";

/** 布局相关 Zustand store */
export const useUIStore = create<UIState>((set, get) => ({
  sidebarCollapsed: false,
  sidebarWidth: 240,
  toolPanelVisible: true,
  toolPanelWidth: 400,
  toolPanelTab: "task",
  theme: initialTheme,
  resolvedTheme: initialResolved,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  adjustSidebarWidth: (delta) =>
    set((state) => ({
      sidebarWidth: Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, state.sidebarWidth + delta),
      ),
    })),
  toggleToolPanel: () =>
    set((state) => ({ toolPanelVisible: !state.toolPanelVisible })),
  adjustToolPanelWidth: (delta) =>
    set((state) => ({
      toolPanelWidth: Math.min(
        TOOL_PANEL_MAX_WIDTH,
        Math.max(TOOL_PANEL_MIN_WIDTH, state.toolPanelWidth - delta),
      ),
    })),
  setToolPanelTab: (tab) => set({ toolPanelTab: tab }),
  openTracePanel: () => set({ toolPanelVisible: true, toolPanelTab: "task" }),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
    const resolvedTheme = applyThemeToDocument(theme);
    set({ theme, resolvedTheme });
  },
  syncResolvedTheme: () => {
    const { theme } = get();
    const resolvedTheme = applyThemeToDocument(theme);
    set({ resolvedTheme });
  },
}));
