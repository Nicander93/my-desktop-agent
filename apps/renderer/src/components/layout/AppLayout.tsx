import { Outlet } from 'react-router-dom';
import { NavSidebar } from './NavSidebar';
import { ResizeHandle } from './ResizeHandle';
import { useUIStore } from '@/stores/uiStore';

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