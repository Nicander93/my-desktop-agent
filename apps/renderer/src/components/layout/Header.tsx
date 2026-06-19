import { PanelRightOpen, PanelRightClose } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const { toolPanelVisible, toggleToolPanel } = useUIStore();

  return (
    <header className="h-12 flex items-center justify-between px-4 border-b border-[var(--color-sidebar-border)] bg-[var(--color-content-bg)]">
      <h1 className="text-sm font-medium text-gray-700">{title}</h1>
      
      <div className="flex items-center gap-2">
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