/** 将主题偏好同步到 document，并在 system 模式下监听系统偏好变化 */
import { useEffect } from "react";
import { useUIStore } from "@/stores/uiStore";

/**
 * 将 UI 偏好解析到 document，并在系统主题模式下监听媒体查询变化。
 */
export function useThemeSync() {
  const theme = useUIStore((s) => s.theme);
  const syncResolvedTheme = useUIStore((s) => s.syncResolvedTheme);

  useEffect(() => {
    syncResolvedTheme();
  }, [theme, syncResolvedTheme]);

  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    /**
     * 系统配色变化时重新解析 store 中的 system 偏好。
     */
    const onChange = () => syncResolvedTheme();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme, syncResolvedTheme]);
}
