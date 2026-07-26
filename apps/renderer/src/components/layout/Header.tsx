/**
 * 顶部栏：会话/工作区信息与右侧上下文面板开关
 */
import { PanelRightOpen, PanelRightClose } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useSessionStore } from '@/stores/sessionStore';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const { toolPanelVisible, toggleToolPanel } = useUIStore();
  const { currentWorkspaceId, workspaces } = useWorkspaceStore();
  const { currentSessionId, sessions } = useSessionStore();
  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId);
  const currentSession = sessions.find((s) => s.id === currentSessionId);

  const displayTitle =
    title
    ?? currentSession?.title
    ?? currentWorkspace?.name
    ?? 'Desktop Agent';

  const subtitle =
    currentWorkspace && displayTitle !== currentWorkspace.name
      ? currentWorkspace.name
      : currentWorkspace?.path;

  return (
    <header className="app-header">
      <div className="min-w-0">
        <h1 className="app-header__title truncate">{displayTitle}</h1>
        {subtitle && (
          <p className="app-header__subtitle">{subtitle}</p>
        )}
      </div>

      <div className="app-header__actions">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleToolPanel}
          aria-label={toolPanelVisible ? '隐藏上下文面板' : '显示上下文面板'}
          title={toolPanelVisible ? '隐藏上下文面板' : '显示上下文面板'}
        >
          {toolPanelVisible ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
        </Button>
      </div>
    </header>
  );
}
