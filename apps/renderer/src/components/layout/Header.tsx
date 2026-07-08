/**
 * 顶部栏：显示当前工作区名称和路径，控制右侧工具面板显隐
 */
import { PanelRightOpen, PanelRightClose } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const { toolPanelVisible, toggleToolPanel } = useUIStore();
  const { currentWorkspaceId, workspaces } = useWorkspaceStore();
  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId);
  const displayTitle = title ?? currentWorkspace?.name ?? 'Desktop Agent';

  return (
    <header className="app-header">
      <div>
        <h1 className="app-header__title">{displayTitle}</h1>
        {currentWorkspace && displayTitle === currentWorkspace.name && (
          <p className="app-header__subtitle">{currentWorkspace.path}</p>
        )}
      </div>
      
      <div className="app-header__actions">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleToolPanel}
          title={toolPanelVisible ? '隐藏工具面板' : '显示工具面板'}
        >
          {toolPanelVisible ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
        </Button>
      </div>
    </header>
  );
}
