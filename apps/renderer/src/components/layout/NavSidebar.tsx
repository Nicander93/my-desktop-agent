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
import { WorkspaceList } from '@/features/workspace/WorkspaceList';
import { cn } from '@/lib/utils';

export function NavSidebar() {
  const { sidebarCollapsed, sidebarWidth, toggleSidebar } = useUIStore();
  const startNewConversation = useNewConversation();
  const { pathname } = useLocation();
  const isChatActive = pathname === '/';

  return (
    <aside
      className={cn(
        'app-sidebar',
        sidebarCollapsed && 'app-sidebar--collapsed'
      )}
      style={sidebarCollapsed ? undefined : { width: sidebarWidth }}
    >
      <ScrollArea className="app-sidebar__body">
        <nav className="app-sidebar__nav">
          <button
            type="button"
            onClick={() => void startNewConversation()}
            className={cn(
              'app-nav-item',
              isChatActive && 'app-nav-item--active',
              sidebarCollapsed && 'app-nav-item--collapsed'
            )}
          >
            <MessageSquarePlus size={20} />
            {!sidebarCollapsed && <span>新对话</span>}
          </button>

          {!sidebarCollapsed && <WorkspaceList collapsed={false} />}
        </nav>
      </ScrollArea>

      <div className="app-sidebar__footer">
        <NavLink
          to="/settings"
          className={({ isActive }) => cn(
            'app-nav-item',
            isActive && 'app-nav-item--active',
            sidebarCollapsed && 'app-nav-item--collapsed'
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
