import { useEffect, useState } from 'react';
import { BookOpen, Download, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSkillStore } from '@/stores/skillStore';
import type { SkillRecord } from '@desktop-agent/shared';
import { cn } from '@/lib/utils';

type TabId = 'installed' | 'catalog' | 'import';

export function SkillSettings() {
  const [tab, setTab] = useState<TabId>('installed');
  const [message, setMessage] = useState('');
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [importName, setImportName] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const {
    skills,
    catalog,
    loading,
    loadAll,
    installCatalog,
    updateSkill,
    deleteSkill,
    importUrl: importSkillUrl,
    refreshSkill,
  } = useSkillStore();

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const showMessage = (text: string, durationMs = 3000) => {
    setMessage(text);
    setTimeout(() => setMessage(''), durationMs);
  };

  const handleToggle = async (skill: SkillRecord) => {
    const error = await updateSkill(skill.id, { enabled: !skill.enabled });
    if (error) showMessage(error);
  };

  const handleDelete = async (id: string) => {
    const error = await deleteSkill(id);
    if (error) showMessage(error);
  };

  const handleInstall = async (catalogId: string) => {
    setInstallingId(catalogId);
    try {
      const result = await installCatalog(catalogId);
      if (result.error) {
        showMessage(result.error, 6000);
        return;
      }
      showMessage('安装成功', 5000);
      setTab('installed');
    } finally {
      setInstallingId(null);
    }
  };

  const handleImport = async () => {
    if (!importName.trim() || !importUrl.trim()) return;
    setImporting(true);
    try {
      const result = await importSkillUrl(importName.trim(), importUrl.trim());
      if (result.error) {
        showMessage(result.error, 6000);
        return;
      }
      showMessage('导入成功', 5000);
      setImportName('');
      setImportUrl('');
      setTab('installed');
    } finally {
      setImporting(false);
    }
  };

  const handleRefresh = async (id: string) => {
    setRefreshingId(id);
    try {
      const result = await refreshSkill(id);
      if (result.error) {
        showMessage(result.error, 6000);
        return;
      }
      showMessage('已刷新 Skill 内容');
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Skills</h2>
          <p className="text-sm text-gray-500 mt-1">
            启用的 Skill 会注册到 Agent，模型通过 Skill 工具按需加载完整指引；对话中 /name 可指定优先使用的 Skill。
          </p>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          {message}
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {([
          ['installed', '已安装'],
          ['catalog', '浏览目录'],
          ['import', '导入 URL'],
        ] as const).map(([id, label]) => (
          <Button
            key={id}
            variant={tab === id ? 'secondary' : 'ghost'}
            onClick={() => setTab(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      {loading && <p className="text-sm text-gray-500 mb-4">加载中...</p>}

      {tab === 'installed' && (
        <div className="space-y-4">
          {skills.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
              暂无 Skill，可从目录安装或导入 URL
            </div>
          )}
          {skills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              refreshing={refreshingId === skill.id}
              onToggle={() => handleToggle(skill)}
              onDelete={() => handleDelete(skill.id)}
              onRefresh={() => handleRefresh(skill.id)}
              onUpdate={(updates) => updateSkill(skill.id, updates).then((err) => err && showMessage(err))}
            />
          ))}
        </div>
      )}

      {tab === 'catalog' && (
        <div className="grid gap-3">
          {catalog.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-gray-200 p-4 bg-gray-50">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <BookOpen size={16} className="text-gray-500" />
                    <span className="font-medium">{entry.displayName}</span>
                    <Badge variant="outline">/{entry.name}</Badge>
                    {entry.installed && <Badge>已安装</Badge>}
                  </div>
                  <p className="text-sm text-gray-600 mt-2">{entry.description}</p>
                  <p className="text-xs text-gray-400 mt-1">分类：{entry.category}</p>
                </div>
                <Button
                  disabled={entry.installed || installingId === entry.id}
                  onClick={() => handleInstall(entry.id)}
                  className="gap-2 shrink-0"
                >
                  <Download size={16} />
                  {installingId === entry.id ? '安装中...' : entry.installed ? '已安装' : '安装'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'import' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            从 URL 导入 SKILL.md，例如 https://officecli.ai/SKILL.md
          </p>
          <div>
            <label className="block text-sm text-gray-600 mb-1">名称（/mention 用）</label>
            <Input
              value={importName}
              onChange={(e) => setImportName(e.target.value)}
              placeholder="officecli"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">SKILL.md URL</label>
            <Input
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://officecli.ai/SKILL.md"
            />
          </div>
          <Button onClick={handleImport} disabled={importing} className="gap-2">
            <Upload size={16} />
            {importing ? '导入中...' : '导入'}
          </Button>
        </div>
      )}
    </div>
  );
}

function SkillCard({
  skill,
  refreshing,
  onToggle,
  onDelete,
  onRefresh,
  onUpdate,
}: {
  skill: SkillRecord;
  refreshing: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onRefresh: () => void;
  onUpdate: (updates: Partial<SkillRecord>) => void;
}) {
  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen size={16} className="text-gray-500 shrink-0" />
          <Input
            value={skill.displayName}
            onChange={(e) => onUpdate({ displayName: e.target.value })}
            className="font-medium bg-transparent border-none focus:outline-none"
          />
          <Badge variant="outline">/{skill.name}</Badge>
          <Badge variant={skill.enabled ? 'default' : 'secondary'}>
            {skill.enabled ? '启用' : '禁用'}
          </Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing} className="gap-1">
            <RefreshCw size={14} />
            {refreshing ? '刷新中' : '刷新'}
          </Button>
          <Button variant="ghost" size="icon" onClick={onToggle}>
            <div className={cn(
              'w-10 h-5 rounded-full transition-colors relative',
              skill.enabled ? 'bg-[var(--color-primary-500)]' : 'bg-gray-300',
            )}>
              <div className={cn(
                'w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform',
                skill.enabled ? 'left-5' : 'left-0.5',
              )} />
            </div>
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} className="text-gray-400 hover:text-red-500">
            <Trash2 size={16} />
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm text-gray-600 mb-1">名称（/mention 用）</label>
          <Input
            value={skill.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
          />
        </div>
        <p className="text-xs text-gray-400 break-all">
          来源：{skill.source === 'catalog' ? '目录安装' : skill.source === 'local' ? '本地文件' : 'URL'} · {skill.sourcePath}
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-600">预览内容</summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded bg-white border border-gray-200 p-3 text-xs whitespace-pre-wrap">
            {skill.contentCache.slice(0, 4000)}
            {skill.contentCache.length > 4000 ? '\n\n...(已截断)' : ''}
          </pre>
        </details>
      </div>
    </div>
  );
}
