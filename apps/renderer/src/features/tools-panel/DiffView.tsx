/** 文件 diff 占位页，尚无数据时展示提示 */
import { GitCompare } from 'lucide-react';

/** Diff 面板占位 */
export function DiffView() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[240px] text-center p-4">
      <GitCompare size={40} className="text-[var(--color-text-muted)] mb-3" />
      <p className="text-sm text-[var(--color-text-secondary)]">暂无变更数据</p>
      <p className="text-xs text-[var(--color-text-muted)] mt-1">Agent 修改文件后会在这里显示对比</p>
    </div>
  );
}
