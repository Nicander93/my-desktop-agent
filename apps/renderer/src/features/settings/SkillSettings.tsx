/**
 * Skill 设置：已安装、目录、URL/本地导入
 */
import { useEffect, useState } from "react";
import { BookOpen, Download, RefreshCw, Trash2, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSkillStore } from "@/stores/skillStore";
import type { SkillRecord } from "@desktop-agent/shared";
import { cn } from "@/lib/utils";

/**
 * Skill 设置页的三个数据入口：本地已装项、官方目录和远程 URL。
 */
type TabId = "installed" | "catalog" | "import";

/** Skill 配置页 */
/**
 * 管理 Agent 可按需加载的 Skill。
 *
 * 导入和目录安装完成后切回已安装列表，刷新操作只更新现有 Skill 的缓存内容。
 */
export function SkillSettings() {
  const [tab, setTab] = useState<TabId>("installed");
  const [message, setMessage] = useState("");
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [importName, setImportName] = useState("");
  const [importUrl, setImportUrl] = useState("");
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

  /**
   * 在本页统一呈现短暂的成功或失败反馈。
   */
  const showMessage = (text: string, durationMs = 3000) => {
    setMessage(text);
    setTimeout(() => setMessage(""), durationMs);
  };

  /**
   * 切换 Skill 是否可注册到 Agent，并报告持久化失败。
   */
  const handleToggle = async (skill: SkillRecord) => {
    const error = await updateSkill(skill.id, { enabled: !skill.enabled });
    if (error) showMessage(error);
  };

  /**
   * 删除 Skill；store 成功后会同步刷新渲染中的安装列表。
   */
  const handleDelete = async (id: string) => {
    const error = await deleteSkill(id);
    if (error) showMessage(error);
  };

  /**
   * 安装目录项，并锁定对应安装按钮直到请求结束。
   */
  const handleInstall = async (catalogId: string) => {
    setInstallingId(catalogId);
    try {
      const result = await installCatalog(catalogId);
      if (result.error) {
        showMessage(result.error, 6000);
        return;
      }
      showMessage("安装成功", 5000);
      setTab("installed");
    } finally {
      setInstallingId(null);
    }
  };

  /**
   * 以显式名称和远程 SKILL.md URL 导入 Skill，成功后清除输入内容。
   */
  const handleImport = async () => {
    if (!importName.trim() || !importUrl.trim()) return;
    setImporting(true);
    try {
      const result = await importSkillUrl(importName.trim(), importUrl.trim());
      if (result.error) {
        showMessage(result.error, 6000);
        return;
      }
      showMessage("导入成功", 5000);
      setImportName("");
      setImportUrl("");
      setTab("installed");
    } finally {
      setImporting(false);
    }
  };

  /**
   * 重新获取单个远程或本地来源的 Skill 内容，避免并发刷新同一条目。
   */
  const handleRefresh = async (id: string) => {
    setRefreshingId(id);
    try {
      const result = await refreshSkill(id);
      if (result.error) {
        showMessage(result.error, 6000);
        return;
      }
      showMessage("已刷新 Skill 内容");
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Skills
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            启用的 Skill 会注册到 Agent，模型通过 Skill
            工具按需加载完整指引；对话中 /name 可指定优先使用的 Skill。
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
            ["import", "导入 URL"],
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
          {skills.length === 0 && (
            <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] p-8 text-center text-[var(--color-text-secondary)]">
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
              onUpdate={(updates) =>
                updateSkill(skill.id, updates).then(
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
                    <BookOpen
                      size={16}
                      className="text-[var(--color-text-secondary)]"
                    />
                    <span className="font-medium">{entry.displayName}</span>
                    <Badge variant="outline">/{entry.name}</Badge>
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
            从 URL 导入 SKILL.md，例如 https://officecli.ai/SKILL.md
          </p>
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              名称（/mention 用）
            </label>
            <Input
              value={importName}
              onChange={(e) => setImportName(e.target.value)}
              placeholder="officecli"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--color-text-secondary)] mb-1">
              SKILL.md URL
            </label>
            <Input
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://officecli.ai/SKILL.md"
            />
          </div>
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
 * 渲染单个已安装 Skill 的元数据、启用状态和内容预览。
 *
 * 编辑请求回传给父级，以保证列表与持久化 store 的数据来源一致。
 */
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
    <div className="p-4 bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border-default)]">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen
            size={16}
            className="text-[var(--color-text-secondary)] shrink-0"
          />
          <Input
            value={skill.displayName}
            onChange={(e) => onUpdate({ displayName: e.target.value })}
            className="font-medium bg-transparent border-none focus:outline-none"
          />
          <Badge variant="outline">/{skill.name}</Badge>
          <Badge variant={skill.enabled ? "default" : "secondary"}>
            {skill.enabled ? "启用" : "禁用"}
          </Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="gap-1"
          >
            <RefreshCw size={14} />
            {refreshing ? "刷新中" : "刷新"}
          </Button>
          <Button variant="ghost" size="icon" onClick={onToggle}>
            <div
              className={cn(
                "w-10 h-5 rounded-full transition-colors relative",
                skill.enabled
                  ? "bg-[var(--color-primary-500)]"
                  : "bg-[var(--color-border-strong)]",
              )}
            >
              <div
                className={cn(
                  "w-4 h-4 bg-[var(--color-bg-surface)] rounded-full absolute top-0.5 transition-transform",
                  skill.enabled ? "left-5" : "left-0.5",
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
            名称（/mention 用）
          </label>
          <Input
            value={skill.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
          />
        </div>
        <p className="text-xs text-[var(--color-text-muted)] break-all">
          来源：
          {skill.source === "catalog"
            ? "目录安装"
            : skill.source === "local"
              ? "本地文件"
              : "URL"}{" "}
          · {skill.sourcePath}
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer text-[var(--color-text-secondary)]">
            预览内容
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] p-3 text-xs whitespace-pre-wrap">
            {skill.contentCache.slice(0, 4000)}
            {skill.contentCache.length > 4000 ? "\n\n...(已截断)" : ""}
          </pre>
        </details>
      </div>
    </div>
  );
}
