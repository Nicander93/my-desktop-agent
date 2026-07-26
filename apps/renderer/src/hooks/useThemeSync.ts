/** 将主题偏好同步到 document，并在 system 模式下监听系统偏好变化 */
import { useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';

export function useThemeSync() {
  const theme = useUIStore((s) => s.theme);
  const syncResolvedTheme = useUIStore((s) => s.syncResolvedTheme);

  useEffect(() => {
    syncResolvedTheme();
  }, [theme, syncResolvedTheme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => syncResolvedTheme();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme, syncResolvedTheme]);
}
