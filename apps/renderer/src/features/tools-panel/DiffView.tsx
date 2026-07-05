import { GitCompare } from 'lucide-react';

export function DiffView() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-4">
      <GitCompare size={48} className="text-gray-300 mb-3" />
      <p className="text-sm text-gray-500">暂无 Diff 数据</p>
      <p className="text-xs text-gray-400 mt-1">Agent 修改文件后会在这里显示对比</p>
    </div>
  );
}