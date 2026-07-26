/** 主布局：侧栏 + 可拖拽宽度 + 子路由出口 */
import { Outlet } from 'react-router-dom';
import { NavSidebar } from './NavSidebar';
import { ResizeHandle } from './ResizeHandle';
import { useUIStore } from '@/stores/uiStore';

/** 应用主框架 */
export function AppLayout() {
  const { sidebarCollapsed, adjustSidebarWidth } = useUIStore();

  return (
    <div className="app-layout">
      <NavSidebar />
      {!sidebarCollapsed && <ResizeHandle onResize={adjustSidebarWidth} />}
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}