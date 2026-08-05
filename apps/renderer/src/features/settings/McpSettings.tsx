/**
 * MCP 设置：已安装、目录安装、JSON 导入与连通测试
 */
import { useEffect, useMemo, useState } from "react";
import { Server, Download, Upload, PlugZap, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useMcpStore } from "@/stores/mcpStore";
import { useSessionStore } from "@/stores/sessionStore";
import type { McpServerRecord } from "@desktop-agent/shared";
import { cn } from "@/lib/utils";

/**
 * MCP 设置页支持的视图；已安装列表、内置目录与兼容配置导入各自独立。
 */
type TabId = "installed" | "catalog" | "import";

/** MCP 配置页 */
/**
 * 展示并维护全局 MCP 配置。
 *
 * 目录安装与 JSON 导入完成后都会回到已安装视图；连接测试仅反馈发现的工具数，
 * 不在渲染层持久化可能包含凭据的连接细节。
 */
export function McpSettings() {
  const [tab, setTab] = useState<TabId>("installed");
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState("");
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

  /**
   * 显示会自动消失的操作反馈，避免安装、导入和测试分别维护提示状态。
   */
  const showMessage = (text: string, durationMs = 3000) => {
    setMessage(text);
    setTimeout(() => setMessage(""), durationMs);
  };

  /**
   * 切换服务启用状态，并将持久化错误反馈给用户。
   */
  const handleToggle = async (server: McpServerRecord) => {
    const error = await updateServer(server.id, { enabled: !server.enabled });
    if (error) showMessage(error);
  };

  /**
   * 删除指定服务；store 负责同步列表，页面只呈现失败信息。
   */
  const handleDelete = async (id: string) => {
    const error = await deleteServer(id);
    if (error) showMessage(error);
  };

  /**
   * 从内置目录安装服务，安装过程保持单项禁用并在成功后展示已安装列表。
   */
  const handleInstall = async (catalogId: string) => {
    setInstallingId(catalogId);
    try {
      const result = await installCatalog(catalogId);
      if (result.error) {
        showMessage(result.error, 6000);
        return;
      }
      const suffix =
        result.toolCount != null ? `，发现 ${result.toolCount} 个工具` : "";
      showMessage(`安装成功${suffix}`, 5000);
      setTab("installed");
    } finally {
      setInstallingId(null);
    }
  };

  /**
   * 导入兼容 mcp.json 的文本；提交前去除首尾空白，成功后清空可能敏感的原始配置。
   */
  const handleImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    try {
      const result = await importJson(importText.trim());
      if (result.error) {
        showMessage(result.error, 6000);
        return;
      }
      const suffix = result.count != null ? `，共 ${result.count} 个` : "";
      showMessage(
        `导入成功${suffix}${result.warning ? `（部分失败：${result.warning}）` : ""}`,
        5000,
      );
      setImportText("");
      setTab("installed");
    } finally {
      setImporting(false);
    }
  };

  /**
   * 对当前会话上下文执行连接测试，并只展示适合 UI 的成功或错误摘要。
   */
  const handleTest = async (id: string) => {
    setTestingId(id);
    const result = await testConnection(id, currentSessionId || undefined);
    setTestingId(null);
    if (result.success) {
      showMessage(`连接成功，发现 ${result.tools?.length ?? 0} 个工具`);
    } else {
      showMessage(result.error || "连接失败");
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            MCP 服务器
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            全局安装，对话中可用 $name 优先指定
            MCP。首次安装会自动下载依赖并验证连接，可能需要 1–3 分钟。
          </p>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          {message}
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {(
          [
            ["installed", "已安装"],
            ["catalog", "浏览目录"],
            ["import", "导入"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            variant={tab === id ? "secondary" : "ghost"}
            onClick={() => setTab(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      {loading && (
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          加载中...
        </p>
      )}

      {tab === "installed" && (
        <div className="space-y-4">
          {servers.length === 0 && (
            <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] p-8 text-center text-[var(--color-text-secondary)]">
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
              onUpdate={(updates) =>
                updateServer(server.id, updates).then(
                  (err) => err && showMessage(err),
                )
              }
            />
          ))}
        </div>
      )}

      {tab === "catalog" && (
        <div className="grid gap-3">
          {catalog.map((entry) => (
            <div
              key={entry.id}
              className="rounded-lg border border-[var(--color-border-default)] p-4 bg-[var(--color-bg-subtle)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Server
                      size={16}
                      className="text-[var(--color-text-secondary)]"
                    />
                    <span className="font-medium">{entry.displayName}</span>
                    <Badge variant="outline">${entry.id}</Badge>
                    {entry.installed && <Badge>已安装</Badge>}
                  </div>
                  <p className="text-sm text-[var(--color-text-secondary)] mt-2">
                    {entry.description}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    分类：{entry.category}
                  </p>
                </div>
                <Button
                  disabled={entry.installed || installingId === entry.id}
                  onClick={() => handleInstall(entry.id)}
                  className="gap-2 shrink-0"
                >
                  <Download size={16} />
                  {installingId === entry.id
                    ? "安装中..."
                    : entry.installed
                      ? "已安装"
                      : "安装"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "import" && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-secondary)]">
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
            {importing ? "导入中..." : "导入"}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * 渲染单个 MCP 服务的可编辑配置与运行控制。
 *
 * 受控更新经由父级 store 操作提交，使目录安装、导入和手动编辑共享同一份列表状态。
 */
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
  /**
   * 将 stdio 命令与参数汇总为可编辑的单行文本；HTTP 服务则直接显示 URL。
   */
  const commandLine = useMemo(() => {
    if (server.transport !== "stdio") return server.url || "";
    return [server.command, ...(server.args || [])].filter(Boolean).join(" ");
  }, [server]);

  return (
    <div className="p-4 bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border-default)]">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Server
            size={16}
            className="text-[var(--color-text-secondary)] shrink-0"
          />
          <Input
            value={server.displayName}
            onChange={(e) => onUpdate({ displayName: e.target.value })}
            className="font-medium bg-transparent border-none focus:outline-none"
          />
          <Badge variant="outline">${server.name}</Badge>
          <Badge variant={server.enabled ? "default" : "secondary"}>
            {server.enabled ? "启用" : "禁用"}
          </Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onTest}
            disabled={testing}
            className="gap-1"
          >
            <PlugZap size={14} />
            {testing ? "测试中" : "测试"}
          </Button>
          <Button variant="ghost" size="icon" onClick={onToggle}>
            <div
              className={cn(
                "w-10 h-5 rounded-full transition-colors relative",
                server.enabled
                  ? "bg-[var(--color-primary-500)]"
                  : "bg-[var(--color-border-strong)]",
              )}
            >
              <div
                className={cn(
                  "w-4 h-4 bg-[var(--color-bg-surface)] rounded-full absolute top-0.5 transition-transform",
                  server.enabled ? "left-5" : "left-0.5",
                )}
              />
            </div>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
            名称（$mention 用）
          </label>
          <Input
            value={server.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
            {server.transport === "stdio" ? "启动命令" : "URL"}
          </label>
          {server.transport === "stdio" ? (
            <Input
              value={commandLine}
              onChange={(e) => {
                const parts =
                  e.target.value.trim().match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
                const normalized = parts.map((part) =>
                  part.replace(/^"|"$/g, ""),
                );
                onUpdate({
                  command: normalized[0] || "",
                  args: normalized.slice(1),
                });
              }}
              placeholder="npx -y @modelcontextprotocol/server-filesystem {workspace}"
            />
          ) : (
            <Input
              value={server.url || ""}
              onChange={(e) => onUpdate({ url: e.target.value })}
            />
          )}
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          来源：{server.source === "catalog" ? "目录安装" : "自定义"} · 传输：
          {server.transport}
        </p>
      </div>
    </div>
  );
}
