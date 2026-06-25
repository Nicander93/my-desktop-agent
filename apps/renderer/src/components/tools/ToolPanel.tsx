import { X, FileText, History, GitCompare, FolderTree } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { FileExplorer } from './FileExplorer';
import { FilePreview } from './FilePreview';
import { ToolHistory } from './ToolHistory';
import { DiffView } from './DiffView';

const tabs = [
  { id: 'explorer' as const, label: '目录', icon: FolderTree },
  { id: 'preview' as const, label: '预览', icon: FileText },
  { id: 'history' as const, label: '历史', icon: History },
  { id: 'diff' as const, label: 'Diff', icon: GitCompare },
];

export function ToolPanel() {
  const { toolPanelVisible, toolPanelWidth, toolPanelTab, setToolPanelTab, toggleToolPanel } = useUIStore();

  if (!toolPanelVisible) return null;

  return (
    <aside
      className="shrink-0 h-full bg-[var(--color-tool-bg)] flex flex-col"
      style={{ width: toolPanelWidth }}
    >
      <div className="flex items-center justify-between px-2 py-2 border-b border-[var(--color-sidebar-border)]">
        <div className="flex gap-0.5 overflow-x-auto">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant={toolPanelTab === tab.id ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setToolPanelTab(tab.id)}
              className={cn(
                "flex items-center gap-1 text-xs shrink-0 px-2",
                toolPanelTab === tab.id && "bg-[var(--color-primary-100)] text-[var(--color-primary-700)]"
              )}
              title={tab.label}
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
          className="h-8 w-8 shrink-0"
        >
          <X size={16} />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {toolPanelTab === 'explorer' && <FileExplorer />}
        {toolPanelTab === 'preview' && <FilePreview />}
        {toolPanelTab === 'history' && <ToolHistory />}
        {toolPanelTab === 'diff' && <DiffView />}
      </ScrollArea>
    </aside>
  );
}
