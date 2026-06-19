import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function GeneralSettings() {
  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-800 mb-6">通用设置</h2>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            应用语言
          </label>
          <select className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)]">
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            主题
          </label>
          <select className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)]">
            <option value="light">浅色</option>
            <option value="dark">深色</option>
            <option value="system">跟随系统</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            工作目录
          </label>
          <div className="flex gap-2">
            <Input
              defaultValue="/Users/username/projects"
              readOnly
              className="flex-1"
            />
            <Button variant="outline">浏览</Button>
          </div>
        </div>
      </div>
    </div>
  );
}