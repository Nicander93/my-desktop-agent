import { Outlet } from 'react-router-dom';
import { NavSidebar } from './NavSidebar';
import { useUIStore } from '@/stores/uiStore';

export function AppLayout() {
  const { sidebarCollapsed } = useUIStore();

  return (
    <div className="flex h-screen bg-[var(--color-content-bg)]">
      <NavSidebar />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}