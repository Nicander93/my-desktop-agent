import { Outlet } from 'react-router-dom';
import { NavSidebar } from './NavSidebar';
import { ResizeHandle } from './ResizeHandle';
import { useUIStore } from '@/stores/uiStore';

export function AppLayout() {
  const { sidebarCollapsed, adjustSidebarWidth } = useUIStore();

  return (
    <div className="flex h-screen bg-[var(--color-content-bg)]">
      <NavSidebar />
      {!sidebarCollapsed && <ResizeHandle onResize={adjustSidebarWidth} />}
      <main className="flex-1 min-w-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}