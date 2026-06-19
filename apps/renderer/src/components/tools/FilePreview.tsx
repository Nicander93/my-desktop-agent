import { File, Folder, Code, FileText, Image } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';

export function FilePreview() {
  const { selectedFile } = useUIStore();

  if (!selectedFile) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <File size={48} className="text-gray-300 mb-3" />
        <p className="text-sm text-gray-500">选择文件进行预览</p>
        <p className="text-xs text-gray-400 mt-1">点击对话中的文件或使用文件树选择</p>
      </div>
    );
  }

  // 模拟文件预览
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-200">
        <Code size={16} className="text-[var(--color-primary-500)]" />
        <span className="text-sm font-medium text-gray-700 truncate">{selectedFile}</span>
      </div>
      
      <pre className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg overflow-x-auto">
{`// 文件内容预览
function hello() {
  console.log("Hello, World!");
}

export default hello;`}
      </pre>
    </div>
  );
}