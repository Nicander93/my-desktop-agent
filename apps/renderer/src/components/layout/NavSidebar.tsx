/**
 * 左侧导航栏
 *
 * 包含新对话入口、工作区列表（WorkspaceList）和设置链接
 */
import { NavLink, useLocation } from 'react-router-dom';
import { MessageSquarePlus, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useNewConversation } from '@/hooks/useNewConversation';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WorkspaceList } from '@/components/workspace/WorkspaceList';
import { cn } from '@/lib/utils';

export function NavSidebar() {
  const { sidebarCollapsed, sidebarWidth, toggleSidebar } = useUIStore();
  const startNewConversation = useNewConversation();
  const { pathname } = useLocation();
  const isChatActive = pathname === '/';

  return (
    <aside
      className={cn(
        'h-full shrink-0 bg-[var(--color-sidebar-bg)] flex flex-col',
        sidebarCollapsed && 'w-16'
      )}
      style={sidebarCollapsed ? undefined : { width: sidebarWidth }}
    >
      <ScrollArea className="flex-1">
        <nav className="p-3 space-y-1">
          <button
            type="button"
            onClick={() => void startNewConversation()}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-200',
              isChatActive
                ? 'bg-[var(--color-primary-100)] text-[var(--color-primary-700)]'
                : 'text-gray-600 hover:bg-gray-100',
              sidebarCollapsed && 'justify-center'
            )}
          >
            <MessageSquarePlus size={20} />
            {!sidebarCollapsed && <span>新对话</span>}
          </button>

          {!sidebarCollapsed && <WorkspaceList collapsed={false} />}
        </nav>
      </ScrollArea>

      <div className="p-3 border-t border-[var(--color-sidebar-border)]">
        <NavLink
          to="/settings"
          className={({ isActive }) => cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-200',
            isActive
              ? 'bg-[var(--color-primary-100)] text-[var(--color-primary-700)]'
              : 'text-gray-600 hover:bg-gray-100',
            sidebarCollapsed && 'justify-center'
          )}
        >
          <Settings size={20} />
          {!sidebarCollapsed && <span>设置</span>}
        </NavLink>

        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="w-full mt-2">
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </Button>
      </div>
    </aside>
  );
}
