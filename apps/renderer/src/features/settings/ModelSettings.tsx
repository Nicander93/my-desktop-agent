/**
 * 模型配置：OpenAI 兼容端点增删改
 */
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ModelConfig, ModelConfigInput } from "@desktop-agent/shared";

/** 创建新增模型的本地优先草稿；密钥始终从空值开始，绝不复用其他配置。 */
const emptyConfig = (): ModelConfigInput => ({
  name: "本地模型",
  provider: "openai-compatible",
  baseURL: "http://127.0.0.1:11434/v1",
  apiKey: null,
  model: "",
  enabled: true,
});

/** 管理 OpenAI-compatible 模型配置；列表刷新始终以主进程持久化结果为准。 */
export function ModelSettings() {
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [draft, setDraft] = useState<ModelConfigInput | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  /** 从主进程刷新模型列表，避免本地乐观状态掩盖默认模型互斥等服务端规则。 */
  const load = async () => {
    const result = await window.electronAPI?.model.getAll();
    if (result?.success) setConfigs(result.configs ?? []);
    else setMessage(result?.error ?? "无法加载模型配置");
  };

  useEffect(() => {
    void load();
  }, []);

  /** 创建或更新模型配置，成功后关闭草稿并重新读取持久化列表。 */
  const save = async (config: ModelConfigInput, id?: string) => {
    setBusy(true);
    const result = id
      ? await window.electronAPI?.model.update(id, config)
      : await window.electronAPI?.model.create(config);
    setBusy(false);
    if (!result?.success) {
      setMessage(result?.error ?? "保存失败");
      return;
    }
    setDraft(null);
    setMessage("已保存");
    await load();
  };

  /** 在不保存草稿的前提下测试 endpoint，允许用户先验证密钥与模型发现结果。 */
  const testConnection = async (config: ModelConfigInput) => {
    setBusy(true);
    const result = await window.electronAPI?.model.testConnection(config);
    setBusy(false);
    setMessage(
      result?.success
        ? `连接成功${result.models?.length ? `，发现 ${result.models.length} 个模型` : ""}`
        : (result?.error ?? "连接失败"),
    );
  };

  /** 删除已持久化配置后刷新列表；失败时保留当前页面状态供用户重试。 */
  const remove = async (id: string) => {
    const result = await window.electronAPI?.model.delete(id);
    if (!result?.success) {
      setMessage(result?.error ?? "删除失败");
      return;
    }
    await load();
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            模型配置
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            连接 OpenAI-compatible 本地或远程服务；本地服务可不填写 API Key。
          </p>
        </div>
        <Button onClick={() => setDraft(emptyConfig())} className="gap-2">
          <Plus size={16} />
          添加模型
        </Button>
      </div>
      {message && (
        <p className="text-sm text-[var(--color-text-secondary)]">{message}</p>
      )}
      {configs.map((config) => (
        <ModelCard
          key={config.id}
          config={config}
          busy={busy}
          onSave={save}
          onTest={testConnection}
          onDelete={remove}
        />
      ))}
      {draft && (
        <ModelCard
          config={draft}
          busy={busy}
          onSave={save}
          onTest={testConnection}
          onCancel={() => setDraft(null)}
        />
      )}
      {!draft && configs.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-sm text-[var(--color-text-secondary)]">
          尚未配置模型。添加后新对话将使用默认配置；现有环境变量仍会作为回退。
        </p>
      )}
    </div>
  );
}

/** 编辑单个已有模型或新建草稿；API Key 使用 password 输入，不在组件中回显转换后的值。 */
function ModelCard({
  config,
  busy,
  onSave,
  onTest,
  onDelete,
  onCancel,
}: {
  config: ModelConfig | ModelConfigInput;
  busy: boolean;
  onSave: (config: ModelConfigInput, id?: string) => Promise<void>;
  onTest: (config: ModelConfigInput) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const persisted = "id" in config;
  const [draft, setDraft] = useState<ModelConfigInput>({
    name: config.name,
    provider: "openai-compatible",
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    model: config.model,
    enabled: config.enabled,
    isDefault: persisted ? config.isDefault : false,
  });
  /** 以函数式更新保持多字段快速输入时的草稿一致性。 */
  const update = <K extends keyof ModelConfigInput>(
    key: K,
    value: ModelConfigInput[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="space-y-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {persisted && config.isDefault && (
            <Badge variant="secondary">默认</Badge>
          )}
          <Badge variant="outline">OpenAI-compatible</Badge>
        </div>
        {persisted && onDelete && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void onDelete(config.id)}
            disabled={busy}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
          >
            <Trash2 size={16} />
          </Button>
        )}
      </div>
      <Field
        label="名称"
        value={draft.name}
        onChange={(value) => update("name", value)}
      />
      <Field
        label="Base URL"
        value={draft.baseURL}
        onChange={(value) => update("baseURL", value)}
        placeholder="http://127.0.0.1:11434/v1"
      />
      <Field
        label="模型"
        value={draft.model}
        onChange={(value) => update("model", value)}
        placeholder="qwen2.5-coder:7b"
      />
      <Field
        label="API Key（本地服务可留空）"
        value={draft.apiKey ?? ""}
        onChange={(value) => update("apiKey", value || null)}
        type="password"
      />
      <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
        <input
          type="checkbox"
          checked={draft.isDefault ?? false}
          onChange={(event) => update("isDefault", event.target.checked)}
        />
        设为默认模型
      </label>
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void onTest(draft)}
        >
          测试连接
        </Button>
        <Button
          disabled={busy}
          onClick={() => void onSave(draft, persisted ? config.id : undefined)}
        >
          保存
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            取消
          </Button>
        )}
      </div>
    </div>
  );
}

/** 复用有标签的受控输入，调用方决定字段是否为密码而不改变草稿语义。 */
function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block text-sm text-[var(--color-text-secondary)]">
      <span className="mb-1 block">{label}</span>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
