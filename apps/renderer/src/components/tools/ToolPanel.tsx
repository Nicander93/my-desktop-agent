import { X, FileText, History, GitCompare } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { FilePreview } from './FilePreview';
import { ToolHistory } from './ToolHistory';
import { DiffView } from './DiffView';

const tabs = [
  { id: 'preview' as const, label: '文件预览', icon: FileText },
  { id: 'history' as const, label: '调用历史', icon: History },
  { id: 'diff' as const, label: 'Diff对比', icon: GitCompare },
];

export function ToolPanel() {
  const { toolPanelVisible, toolPanelTab, setToolPanelTab, toggleToolPanel } = useUIStore();

  if (!toolPanelVisible) return null;

  return (
    <aside className="w-80 h-full border-l border-[var(--color-sidebar-border)] bg-[var(--color-tool-bg)] flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-sidebar-border)]">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant={toolPanelTab === tab.id ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setToolPanelTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 text-xs",
                toolPanelTab === tab.id && "bg-[var(--color-primary-100)] text-[var(--color-primary-700)]"
              )}
            >
              <tab.icon size={14} />
              {tab.label}
            </Button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleToolPanel}
          className="h-8 w-8"
        >
          <X size={16} />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {toolPanelTab === 'preview' && <FilePreview />}
        {toolPanelTab === 'history' && <ToolHistory />}
        {toolPanelTab === 'diff' && <DiffView />}
      </ScrollArea>
    </aside>
  );
}