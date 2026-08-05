/**
 * 左侧导航栏
 *
 * 品牌、新建对话、工作区列表与设置入口
 */
import { NavLink, useLocation } from "react-router-dom";
import {
  MessageSquare,
  MessageSquarePlus,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useUIStore } from "@/stores/uiStore";
import { useNewConversation } from "@/hooks/useNewConversation";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AppLogo } from "@/components/brand/AppLogo";
import { WorkspaceList } from "@/features/workspace/WorkspaceList";
import { cn } from "@/lib/utils";

/**
 * 提供主导航、工作区入口、新会话操作及侧栏折叠控制。
 */
export function NavSidebar() {
  const { sidebarCollapsed, sidebarWidth, toggleSidebar } = useUIStore();
  const startNewConversation = useNewConversation();
  const { pathname } = useLocation();
  const isChatActive = pathname === "/";

  return (
    <aside
      className={cn(
        "app-sidebar",
        sidebarCollapsed && "app-sidebar--collapsed",
      )}
      style={sidebarCollapsed ? undefined : { width: sidebarWidth }}
    >
      <div
        className={cn("app-brand", sidebarCollapsed && "app-brand--collapsed")}
      >
        <AppLogo className="app-brand__logo" size={28} />
        {!sidebarCollapsed && (
          <span className="app-brand__name">Desktop Agent</span>
        )}
      </div>

      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={() => void startNewConversation()}
          className={cn(
            "app-nav-new-chat",
            sidebarCollapsed && "app-nav-new-chat--collapsed",
          )}
          aria-label="新对话"
          title="新对话"
        >
          <MessageSquarePlus size={18} />
          {!sidebarCollapsed && <span>新对话</span>}
        </button>
      </div>

      <ScrollArea className="app-sidebar__body">
        <nav className="app-sidebar__nav">
          <WorkspaceList collapsed={sidebarCollapsed} />
        </nav>
      </ScrollArea>

      <div className="app-sidebar__footer">
        <NavLink
          to="/"
          end
          className={() =>
            cn(
              "app-nav-item",
              isChatActive && "app-nav-item--active",
              sidebarCollapsed && "app-nav-item--collapsed",
            )
          }
          title="对话"
        >
          <MessageSquare size={20} />
          {!sidebarCollapsed && <span>对话</span>}
        </NavLink>

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              "app-nav-item",
              isActive && "app-nav-item--active",
              sidebarCollapsed && "app-nav-item--collapsed",
            )
          }
          title="设置"
        >
          <Settings size={20} />
          {!sidebarCollapsed && <span>设置</span>}
        </NavLink>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="w-full mt-1"
          aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
        >
          {sidebarCollapsed ? (
            <ChevronRight size={16} />
          ) : (
            <ChevronLeft size={16} />
          )}
        </Button>
      </div>
    </aside>
  );
}
