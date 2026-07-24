import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ModelConfig, ModelConfigInput } from '@desktop-agent/shared';

const emptyConfig = (): ModelConfigInput => ({
  name: '本地模型',
  provider: 'openai-compatible',
  baseURL: 'http://127.0.0.1:11434/v1',
  apiKey: null,
  model: '',
  enabled: true,
});

export function ModelSettings() {
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [draft, setDraft] = useState<ModelConfigInput | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const result = await window.electronAPI?.model.getAll();
    if (result?.success) setConfigs(result.configs ?? []);
    else setMessage(result?.error ?? '无法加载模型配置');
  };

  useEffect(() => { void load(); }, []);

  const save = async (config: ModelConfigInput, id?: string) => {
    setBusy(true);
    const result = id
      ? await window.electronAPI?.model.update(id, config)
      : await window.electronAPI?.model.create(config);
    setBusy(false);
    if (!result?.success) { setMessage(result?.error ?? '保存失败'); return; }
    setDraft(null);
    setMessage('已保存');
    await load();
  };

  const testConnection = async (config: ModelConfigInput) => {
    setBusy(true);
    const result = await window.electronAPI?.model.testConnection(config);
    setBusy(false);
    setMessage(result?.success ? `连接成功${result.models?.length ? `，发现 ${result.models.length} 个模型` : ''}` : (result?.error ?? '连接失败'));
  };

  const remove = async (id: string) => {
    const result = await window.electronAPI?.model.delete(id);
    if (!result?.success) { setMessage(result?.error ?? '删除失败'); return; }
    await load();
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">模型配置</h2>
          <p className="text-sm text-gray-500">连接 OpenAI-compatible 本地或远程服务；本地服务可不填写 API Key。</p>
        </div>
        <Button onClick={() => setDraft(emptyConfig())} className="gap-2"><Plus size={16} />添加模型</Button>
      </div>
      {message && <p className="text-sm text-gray-600">{message}</p>}
      {configs.map((config) => (
        <ModelCard key={config.id} config={config} busy={busy} onSave={save} onTest={testConnection} onDelete={remove} />
      ))}
      {draft && <ModelCard config={draft} busy={busy} onSave={save} onTest={testConnection} onCancel={() => setDraft(null)} />}
      {!draft && configs.length === 0 && <p className="rounded-lg border border-dashed p-6 text-sm text-gray-500">尚未配置模型。添加后新对话将使用默认配置；现有环境变量仍会作为回退。</p>}
    </div>
  );
}

function ModelCard({ config, busy, onSave, onTest, onDelete, onCancel }: {
  config: ModelConfig | ModelConfigInput;
  busy: boolean;
  onSave: (config: ModelConfigInput, id?: string) => Promise<void>;
  onTest: (config: ModelConfigInput) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const persisted = 'id' in config;
  const [draft, setDraft] = useState<ModelConfigInput>({
    name: config.name,
    provider: 'openai-compatible',
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    model: config.model,
    enabled: config.enabled,
    isDefault: persisted ? config.isDefault : false,
  });
  const update = <K extends keyof ModelConfigInput>(key: K, value: ModelConfigInput[K]) => setDraft((current) => ({ ...current, [key]: value }));

  return <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">{persisted && config.isDefault && <Badge variant="secondary">默认</Badge>}<Badge variant="outline">OpenAI-compatible</Badge></div>
      {persisted && onDelete && <Button variant="ghost" size="icon" onClick={() => void onDelete(config.id)} disabled={busy} className="text-gray-400 hover:text-red-500"><Trash2 size={16} /></Button>}
    </div>
    <Field label="名称" value={draft.name} onChange={(value) => update('name', value)} />
    <Field label="Base URL" value={draft.baseURL} onChange={(value) => update('baseURL', value)} placeholder="http://127.0.0.1:11434/v1" />
    <Field label="模型" value={draft.model} onChange={(value) => update('model', value)} placeholder="qwen2.5-coder:7b" />
    <Field label="API Key（本地服务可留空）" value={draft.apiKey ?? ''} onChange={(value) => update('apiKey', value || null)} type="password" />
    <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={draft.isDefault ?? false} onChange={(event) => update('isDefault', event.target.checked)} />设为默认模型</label>
    <div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => void onTest(draft)}>测试连接</Button><Button disabled={busy} onClick={() => void onSave(draft, persisted ? config.id : undefined)}>保存</Button>{onCancel && <Button variant="ghost" onClick={onCancel}>取消</Button>}</div>
  </div>;
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <label className="block text-sm text-gray-600"><span className="mb-1 block">{label}</span><Input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}
