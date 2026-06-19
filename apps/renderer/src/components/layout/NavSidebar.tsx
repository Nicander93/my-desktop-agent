import { NavLink } from 'react-router-dom';
import { 
  MessageSquarePlus, 
  Search, 
  Plug, 
  Zap, 
  Settings,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useSessionStore } from '@/stores/sessionStore';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', icon: MessageSquarePlus, label: '新对话' },
  { path: '/search', icon: Search, label: '搜索' },
  { path: '/plugins', icon: Plug, label: '插件' },
  { path: '/automation', icon: Zap, label: '自动化' },
];

export function NavSidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { sessions, currentSessionId, setCurrentSession } = useSessionStore();

  return (
    <aside className={cn(
      "h-full bg-[var(--color-sidebar-bg)] border-r border-[var(--color-sidebar-border)] flex flex-col transition-all duration-300",
      sidebarCollapsed ? "w-16" : "w-60"
    )}>
      <ScrollArea className="flex-1">
        <nav className="p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-200",
                isActive 
                  ? "bg-[var(--color-primary-100)] text-[var(--color-primary-700)]" 
                  : "text-gray-600 hover:bg-gray-100",
                sidebarCollapsed && "justify-center"
              )}
            >
              <item.icon size={20} />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </NavLink>
          ))}

          {!sidebarCollapsed && (
            <>
              <div className="pt-4 pb-2">
                <p className="px-3 text-xs font-medium text-gray-400 uppercase">项目</p>
              </div>
              <div className="space-y-1">
                {sessions.slice(0, 5).map((session) => (
                  <button
                    key={session.id}
                    onClick={() => setCurrentSession(session.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors duration-200",
                      currentSessionId === session.id
                        ? "bg-[var(--color-primary-50)] text-[var(--color-primary-700)]"
                        : "text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    <span className="truncate">{session.title}</span>
                  </button>
                ))}
              </div>

              <div className="pt-4 pb-2">
                <p className="px-3 text-xs font-medium text-gray-400 uppercase">对话</p>
              </div>
              <p className="px-3 text-sm text-gray-400">暂无聊天</p>
            </>
          )}
        </nav>
      </ScrollArea>

      <div className="p-3 border-t border-[var(--color-sidebar-border)]">
        <NavLink
          to="/settings"
          className={({ isActive }) => cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-200",
            isActive 
              ? "bg-[var(--color-primary-100)] text-[var(--color-primary-700)]" 
              : "text-gray-600 hover:bg-gray-100",
            sidebarCollapsed && "justify-center"
          )}
        >
          <Settings size={20} />
          {!sidebarCollapsed && <span>设置</span>}
        </NavLink>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="w-full mt-2"
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </Button>
      </div>
    </aside>
  );
}