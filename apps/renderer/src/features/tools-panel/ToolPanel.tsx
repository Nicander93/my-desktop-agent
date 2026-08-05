/**
 * 右侧上下文面板：任务 / 文件 / 预览 / 变更
 */
import { useState } from "react";
import {
  X,
  FileText,
  GitCompare,
  FolderTree,
  ListTodo,
  ChevronDown,
} from "lucide-react";
import { useUIStore, type ToolPanelTab } from "@/stores/uiStore";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { FileExplorer } from "./FileExplorer";
import { FilePreview } from "./FilePreview";
import { ToolHistory } from "./ToolHistory";
import { DiffView } from "./DiffView";
import { TracePanel } from "./TracePanel";

const tabs: { id: ToolPanelTab; label: string; icon: typeof ListTodo }[] = [
  { id: "task", label: "任务", icon: ListTodo },
  { id: "files", label: "文件", icon: FolderTree },
  { id: "preview", label: "预览", icon: FileText },
  { id: "changes", label: "变更", icon: GitCompare },
];

/**
 * 组合工具调用历史与按需展开的原始 trace，避免默认占用任务面板空间。
 */
function TaskTabContent() {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("min-h-0", showAdvanced ? "h-1/2" : "flex-1")}>
        <ScrollArea className="h-full">
          <div className="px-3 pt-3 pb-1">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
              工具调用
            </p>
          </div>
          <ToolHistory />
        </ScrollArea>
      </div>

      <div className="border-t border-[var(--color-border-default)]">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
        >
          <ChevronDown
            size={14}
            className={cn("transition-transform", showAdvanced && "rotate-180")}
          />
          高级 · 原始 Trace
        </button>
        {showAdvanced && (
          <div className="h-[min(50vh,320px)] min-h-[180px] border-t border-[var(--color-border-default)]">
            <TracePanel />
          </div>
        )}
      </div>
    </div>
  );
}

/** 可拖拽宽度的右侧上下文面板 */
export function ToolPanel() {
  const {
    toolPanelVisible,
    toolPanelWidth,
    toolPanelTab,
    setToolPanelTab,
    toggleToolPanel,
  } = useUIStore();

  if (!toolPanelVisible) return null;

  return (
    <aside
      className="shrink-0 h-full bg-[var(--color-tool-bg)] flex flex-col border-l border-[var(--color-border-default)]"
      style={{ width: toolPanelWidth }}
    >
      <div className="flex items-center justify-between gap-2 px-2 py-2 border-b border-[var(--color-border-default)]">
        <Tabs
          items={tabs}
          value={toolPanelTab}
          onChange={setToolPanelTab}
          className="min-w-0 flex-1"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleToolPanel}
          className="h-8 w-8 shrink-0"
          aria-label="关闭上下文面板"
        >
          <X size={16} />
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {toolPanelTab === "task" && <TaskTabContent />}
        {toolPanelTab === "files" && <FileExplorer />}
        {toolPanelTab === "preview" && <FilePreview />}
        {toolPanelTab === "changes" && (
          <ScrollArea className="h-full">
            <DiffView />
          </ScrollArea>
        )}
      </div>
    </aside>
  );
}
