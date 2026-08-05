/**
 * 模型配置持久化
 *
 * OpenAI 兼容端点，provider 固定 openai-compatible；同时只能有一个 isDefault
 */
import { getDatabase, saveDatabase } from "../db";
import { v4 as uuidv4 } from "uuid";
import type {
  ModelConfig,
  ModelConfigInput,
  ModelConnectionTestResult,
} from "@desktop-agent/shared";

/**
 * 执行多行模型配置查询并释放 SQLite statement。
 */
function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDatabase().prepare(sql);
  stmt.bind(params);
  const results: T[] = [];
  while (stmt.step()) results.push(stmt.getAsObject() as T);
  stmt.free();
  return results;
}

/**
 * 执行单行模型配置查询，未命中时返回 undefined。
 */
function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  return queryAll<T>(sql, params)[0];
}

/**
 * 将 SQLite 原始行映射为共享 ModelConfig 契约。
 *
 * provider 当前固定为 openai-compatible，避免数据库历史值影响 Runtime 的 Provider 选择。
 */
function rowToRecord(row: Record<string, unknown>): ModelConfig {
  return {
    id: row.id as string,
    name: row.name as string,
    provider: "openai-compatible",
    baseURL: row.baseURL as string,
    apiKey: (row.apiKey as string | null) ?? null,
    model: row.model as string,
    enabled: Boolean(row.enabled),
    isDefault: Boolean(row.isDefault),
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

/**
 * 规范化并校验模型服务 Base URL。
 *
 * 去除结尾斜杠以保持 Provider 请求路径一致，缺少 HTTP 协议时直接拒绝而非猜测端点。
 */
function normalizeBaseURL(baseURL: string): string {
  const value = baseURL.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(value))
    throw new Error("Base URL 必须以 http:// 或 https:// 开头");
  return value;
}

/**
 * 校验并清理可持久化的模型配置输入。
 *
 * 凭证可为空以支持无鉴权本地服务，名称与模型名则必须非空以保证 UI 选择和 Runtime 日志可辨识。
 */
function validateInput(input: ModelConfigInput): ModelConfigInput {
  if (!input.name.trim()) throw new Error("配置名称不能为空");
  if (!input.model.trim()) throw new Error("模型名称不能为空");
  return {
    ...input,
    name: input.name.trim(),
    model: input.model.trim(),
    baseURL: normalizeBaseURL(input.baseURL),
  };
}

/**
 * 清除现有默认模型标志，为设置新默认项保持单一默认值不变量。
 */
function clearDefault(): void {
  getDatabase().run(
    "UPDATE model_configs SET isDefault = 0 WHERE isDefault = 1",
  );
}

/**
 * 读取全部模型配置，默认项优先显示。
 */
export function getAllModelConfigs(): ModelConfig[] {
  return queryAll<Record<string, unknown>>(
    "SELECT * FROM model_configs ORDER BY isDefault DESC, createdAt ASC",
  ).map(rowToRecord);
}

/**
 * 按稳定 ID 读取模型配置。
 */
export function getModelConfig(id: string): ModelConfig | undefined {
  const row = queryOne<Record<string, unknown>>(
    "SELECT * FROM model_configs WHERE id = ?",
    [id],
  );
  return row ? rowToRecord(row) : undefined;
}

/**
 * 读取可用的默认模型配置。
 *
 * 没有显式默认项时回退到最早创建的 enabled 配置，确保旧数据仍有确定性选择。
 */
export function getDefaultModelConfig(): ModelConfig | undefined {
  const row = queryOne<Record<string, unknown>>(
    "SELECT * FROM model_configs WHERE enabled = 1 ORDER BY isDefault DESC, createdAt ASC LIMIT 1",
  );
  return row ? rowToRecord(row) : undefined;
}

/**
 * 创建模型配置，并在首条记录或显式请求时设为唯一默认项。
 *
 * API Key 仅写入 Host 数据库；renderer 只能通过受限 IPC 使用，不应把它写入消息或 trace。
 */
export function createModelConfig(input: ModelConfigInput): ModelConfig {
  const next = validateInput(input);
  if (queryOne("SELECT id FROM model_configs WHERE name = ?", [next.name]))
    throw new Error(`模型配置 "${next.name}" 已存在`);
  const id = uuidv4();
  const now = Date.now();
  const isDefault = next.isDefault ?? getAllModelConfigs().length === 0;
  if (isDefault) clearDefault();
  getDatabase().run(
    `INSERT INTO model_configs (id, name, provider, baseURL, apiKey, model, enabled, isDefault, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      next.name,
      "openai-compatible",
      next.baseURL,
      next.apiKey?.trim() || null,
      next.model,
      next.enabled === false ? 0 : 1,
      isDefault ? 1 : 0,
      now,
      now,
    ],
  );
  saveDatabase();
  return getModelConfig(id)!;
}

/**
 * 合并更新模型配置，并在请求设为默认项时维持唯一默认项约束。
 *
 * 未提供 API Key 时保留原值，显式提供空值才清除凭据。
 */
export function updateModelConfig(
  id: string,
  updates: Partial<ModelConfigInput>,
): ModelConfig | undefined {
  const current = getModelConfig(id);
  if (!current) return undefined;
  const next = validateInput({
    ...current,
    ...updates,
    apiKey: updates.apiKey === undefined ? current.apiKey : updates.apiKey,
  });
  if (
    next.name !== current.name &&
    queryOne("SELECT id FROM model_configs WHERE name = ? AND id != ?", [
      next.name,
      id,
    ])
  ) {
    throw new Error(`模型配置 "${next.name}" 已存在`);
  }
  const isDefault = next.isDefault ?? current.isDefault;
  if (isDefault) clearDefault();
  const now = Date.now();
  getDatabase().run(
    `UPDATE model_configs SET name = ?, provider = ?, baseURL = ?, apiKey = ?, model = ?, enabled = ?, isDefault = ?, updatedAt = ? WHERE id = ?`,
    [
      next.name,
      "openai-compatible",
      next.baseURL,
      next.apiKey?.trim() || null,
      next.model,
      next.enabled === false ? 0 : 1,
      isDefault ? 1 : 0,
      now,
      id,
    ],
  );
  saveDatabase();
  return getModelConfig(id);
}

/**
 * 删除模型配置并将数据库变更落盘。
 */
export function deleteModelConfig(id: string): boolean {
  getDatabase().run("DELETE FROM model_configs WHERE id = ?", [id]);
  saveDatabase();
  return true;
}

/** GET /models 探测连通性，10s 超时；apiKey 为空时不带 Authorization */
export async function testModelConnection(
  config: Pick<ModelConfig, "baseURL" | "apiKey">,
): Promise<ModelConnectionTestResult> {
  const headers: HeadersInit = { Accept: "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  try {
    const response = await fetch(`${normalizeBaseURL(config.baseURL)}/models`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      return {
        success: false,
        error: `模型服务返回 ${response.status} ${response.statusText}`,
      };
    const data = (await response.json()) as { data?: Array<{ id?: unknown }> };
    const models = Array.isArray(data.data)
      ? data.data
          .map((item) => item.id)
          .filter((id): id is string => typeof id === "string")
      : [];
    return { success: true, models };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "连接失败",
    };
  }
}
