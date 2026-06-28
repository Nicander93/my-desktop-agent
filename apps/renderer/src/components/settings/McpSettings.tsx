import { useEffect, useMemo, useState } from 'react';
import { Server, Download, Upload, PlugZap, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useMcpStore } from '@/stores/mcpStore';
import { useSessionStore } from '@/stores/sessionStore';
import type { McpServerRecord } from '@desktop-agent/shared';
import { cn } from '@/lib/utils';

type TabId = 'installed' | 'catalog' | 'import';

export function McpSettings() {
  const [tab, setTab] = useState<TabId>('installed');
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const {
    servers,
    catalog,
    loading,
    loadAll,
    installCatalog,
    updateServer,
    deleteServer,
    importJson,
    testConnection,
  } = useMcpStore();
  const currentSessionId = useSessionStore((s) => s.currentSessionId);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const showMessage = (text: string, durationMs = 3000) => {
    setMessage(text);
    setTimeout(() => setMessage(''), durationMs);
  };

  const handleToggle = async (server: McpServerRecord) => {
    const error = await updateServer(server.id, { enabled: !server.enabled });
    if (error) showMessage(error);
  };

  const handleDelete = async (id: string) => {
    const error = await deleteServer(id);
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
      const suffix = result.toolCount != null ? `，发现 ${result.toolCount} 个工具` : '';
      showMessage(`安装成功${suffix}`, 5000);
      setTab('installed');
    } finally {
      setInstallingId(null);
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    try {
      const result = await importJson(importText.trim());
      if (result.error) {
        showMessage(result.error, 6000);
        return;
      }
      const suffix = result.count != null ? `，共 ${result.count} 个` : '';
      showMessage(`导入成功${suffix}${result.warning ? `（部分失败：${result.warning}）` : ''}`, 5000);
      setImportText('');
      setTab('installed');
    } finally {
      setImporting(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    const result = await testConnection(id, currentSessionId || undefined);
    setTestingId(null);
    if (result.success) {
      showMessage(`连接成功，发现 ${result.tools?.length ?? 0} 个工具`);
    } else {
      showMessage(result.error || '连接失败');
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">MCP 服务器</h2>
          <p className="text-sm text-gray-500 mt-1">全局安装，对话中可用 $name 优先指定 MCP。首次安装会自动下载依赖并验证连接，可能需要 1–3 分钟。</p>
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
          ['import', '导入'],
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
          {servers.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
              暂无 MCP，可从目录安装或导入配置
            </div>
          )}
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              testing={testingId === server.id}
              onToggle={() => handleToggle(server)}
              onDelete={() => handleDelete(server.id)}
              onTest={() => handleTest(server.id)}
              onUpdate={(updates) => updateServer(server.id, updates).then((err) => err && showMessage(err))}
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
                    <Server size={16} className="text-gray-500" />
                    <span className="font-medium">{entry.displayName}</span>
                    <Badge variant="outline">${entry.id}</Badge>
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
            粘贴 Cursor / Claude Desktop 格式的 mcp.json 内容
          </p>
          <Textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={`{\n  "mcpServers": {\n    "my-server": {\n      "command": "npx",\n      "args": ["-y", "..."]\n    }\n  }\n}`}
            rows={12}
          />
          <Button onClick={handleImport} disabled={importing} className="gap-2">
            <Upload size={16} />
            {importing ? '导入中...' : '导入'}
          </Button>
        </div>
      )}
    </div>
  );
}

function ServerCard({
  server,
  testing,
  onToggle,
  onDelete,
  onTest,
  onUpdate,
}: {
  server: McpServerRecord;
  testing: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onTest: () => void;
  onUpdate: (updates: Partial<McpServerRecord>) => void;
}) {
  const commandLine = useMemo(() => {
    if (server.transport !== 'stdio') return server.url || '';
    return [server.command, ...(server.args || [])].filter(Boolean).join(' ');
  }, [server]);

  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Server size={16} className="text-gray-500 shrink-0" />
          <Input
            value={server.displayName}
            onChange={(e) => onUpdate({ displayName: e.target.value })}
            className="font-medium bg-transparent border-none focus:outline-none"
          />
          <Badge variant="outline">${server.name}</Badge>
          <Badge variant={server.enabled ? 'default' : 'secondary'}>
            {server.enabled ? '启用' : '禁用'}
          </Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={onTest} disabled={testing} className="gap-1">
            <PlugZap size={14} />
            {testing ? '测试中' : '测试'}
          </Button>
          <Button variant="ghost" size="icon" onClick={onToggle}>
            <div className={cn(
              'w-10 h-5 rounded-full transition-colors relative',
              server.enabled ? 'bg-[var(--color-primary-500)]' : 'bg-gray-300',
            )}>
              <div className={cn(
                'w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform',
                server.enabled ? 'left-5' : 'left-0.5',
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
          <label className="block text-sm text-gray-600 mb-1">名称（$mention 用）</label>
          <Input
            value={server.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">
            {server.transport === 'stdio' ? '启动命令' : 'URL'}
          </label>
          {server.transport === 'stdio' ? (
            <Input
              value={commandLine}
              onChange={(e) => {
                const parts = e.target.value.trim().match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
                const normalized = parts.map((part) => part.replace(/^"|"$/g, ''));
                onUpdate({
                  command: normalized[0] || '',
                  args: normalized.slice(1),
                });
              }}
              placeholder="npx -y @modelcontextprotocol/server-filesystem {workspace}"
            />
          ) : (
            <Input
              value={server.url || ''}
              onChange={(e) => onUpdate({ url: e.target.value })}
            />
          )}
        </div>
        <p className="text-xs text-gray-400">
          来源：{server.source === 'catalog' ? '目录安装' : '自定义'} · 传输：{server.transport}
        </p>
      </div>
    </div>
  );
}
