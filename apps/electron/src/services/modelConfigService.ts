import { getDatabase, saveDatabase } from '../db';
import { v4 as uuidv4 } from 'uuid';
import type { ModelConfig, ModelConfigInput, ModelConnectionTestResult } from '@desktop-agent/shared';

function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDatabase().prepare(sql);
  stmt.bind(params);
  const results: T[] = [];
  while (stmt.step()) results.push(stmt.getAsObject() as T);
  stmt.free();
  return results;
}

function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  return queryAll<T>(sql, params)[0];
}

function rowToRecord(row: Record<string, unknown>): ModelConfig {
  return {
    id: row.id as string,
    name: row.name as string,
    provider: 'openai-compatible',
    baseURL: row.baseURL as string,
    apiKey: (row.apiKey as string | null) ?? null,
    model: row.model as string,
    enabled: Boolean(row.enabled),
    isDefault: Boolean(row.isDefault),
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

function normalizeBaseURL(baseURL: string): string {
  const value = baseURL.trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(value)) throw new Error('Base URL 必须以 http:// 或 https:// 开头');
  return value;
}

function validateInput(input: ModelConfigInput): ModelConfigInput {
  if (!input.name.trim()) throw new Error('配置名称不能为空');
  if (!input.model.trim()) throw new Error('模型名称不能为空');
  return { ...input, name: input.name.trim(), model: input.model.trim(), baseURL: normalizeBaseURL(input.baseURL) };
}

function clearDefault(): void {
  getDatabase().run('UPDATE model_configs SET isDefault = 0 WHERE isDefault = 1');
}

export function getAllModelConfigs(): ModelConfig[] {
  return queryAll<Record<string, unknown>>('SELECT * FROM model_configs ORDER BY isDefault DESC, createdAt ASC').map(rowToRecord);
}

export function getModelConfig(id: string): ModelConfig | undefined {
  const row = queryOne<Record<string, unknown>>('SELECT * FROM model_configs WHERE id = ?', [id]);
  return row ? rowToRecord(row) : undefined;
}

export function getDefaultModelConfig(): ModelConfig | undefined {
  const row = queryOne<Record<string, unknown>>('SELECT * FROM model_configs WHERE enabled = 1 ORDER BY isDefault DESC, createdAt ASC LIMIT 1');
  return row ? rowToRecord(row) : undefined;
}

export function createModelConfig(input: ModelConfigInput): ModelConfig {
  const next = validateInput(input);
  if (queryOne('SELECT id FROM model_configs WHERE name = ?', [next.name])) throw new Error(`模型配置 "${next.name}" 已存在`);
  const id = uuidv4();
  const now = Date.now();
  const isDefault = next.isDefault ?? getAllModelConfigs().length === 0;
  if (isDefault) clearDefault();
  getDatabase().run(
    `INSERT INTO model_configs (id, name, provider, baseURL, apiKey, model, enabled, isDefault, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, next.name, 'openai-compatible', next.baseURL, next.apiKey?.trim() || null, next.model, next.enabled === false ? 0 : 1, isDefault ? 1 : 0, now, now],
  );
  saveDatabase();
  return getModelConfig(id)!;
}

export function updateModelConfig(id: string, updates: Partial<ModelConfigInput>): ModelConfig | undefined {
  const current = getModelConfig(id);
  if (!current) return undefined;
  const next = validateInput({ ...current, ...updates, apiKey: updates.apiKey === undefined ? current.apiKey : updates.apiKey });
  if (next.name !== current.name && queryOne('SELECT id FROM model_configs WHERE name = ? AND id != ?', [next.name, id])) {
    throw new Error(`模型配置 "${next.name}" 已存在`);
  }
  const isDefault = next.isDefault ?? current.isDefault;
  if (isDefault) clearDefault();
  const now = Date.now();
  getDatabase().run(
    `UPDATE model_configs SET name = ?, provider = ?, baseURL = ?, apiKey = ?, model = ?, enabled = ?, isDefault = ?, updatedAt = ? WHERE id = ?`,
    [next.name, 'openai-compatible', next.baseURL, next.apiKey?.trim() || null, next.model, next.enabled === false ? 0 : 1, isDefault ? 1 : 0, now, id],
  );
  saveDatabase();
  return getModelConfig(id);
}

export function deleteModelConfig(id: string): boolean {
  getDatabase().run('DELETE FROM model_configs WHERE id = ?', [id]);
  saveDatabase();
  return true;
}

export async function testModelConnection(config: Pick<ModelConfig, 'baseURL' | 'apiKey'>): Promise<ModelConnectionTestResult> {
  const headers: HeadersInit = { Accept: 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  try {
    const response = await fetch(`${normalizeBaseURL(config.baseURL)}/models`, { headers, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return { success: false, error: `模型服务返回 ${response.status} ${response.statusText}` };
    const data = await response.json() as { data?: Array<{ id?: unknown }> };
    const models = Array.isArray(data.data) ? data.data.map((item) => item.id).filter((id): id is string => typeof id === 'string') : [];
    return { success: true, models };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '连接失败' };
  }
}
