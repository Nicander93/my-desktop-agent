/**
 * 对话（Conversation）数据服务
 *
 * 对话归属工作区，id 同时作为 Agent sessionId 使用
 */
import { getDatabase, saveDatabase } from "../db";
import { v4 as uuidv4 } from "uuid";

/**
 * 持久化的工作区对话。
 *
 * `id` 同时作为 Agent Runtime sessionId；因此不能在修改模型配置或删除对话后继续复用旧会话实例。
 */
export interface Conversation {
  id: string;
  workspaceId: string;
  title: string;
  model: string | null;
  modelConfigId: string | null;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * 执行多行 SQLite 查询并在完成后释放 statement。
 */
function queryAll<T>(sql: string, params: any[] = []): T[] {
  const db = getDatabase();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

/**
 * 执行单行 SQLite 查询，未命中时返回 undefined。
 */
function queryOne<T>(sql: string, params: any[] = []): T | undefined {
  const results = queryAll<T>(sql, params);
  return results[0];
}

/**
 * 在指定工作区创建对话并生成其 Runtime sessionId。
 *
 * 模型字段只保存选择，实际连接配置在发送消息时由 Host 解析，避免把凭证写入 conversations 表。
 */
export function createConversation(
  workspaceId: string,
  title?: string,
  model?: string,
  modelConfigId?: string,
): Conversation {
  const db = getDatabase();
  const id = uuidv4();
  const now = Date.now();

  db.run(
    `INSERT INTO conversations (id, workspaceId, title, model, modelConfigId, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      workspaceId,
      title || "新对话",
      model || null,
      modelConfigId || null,
      now,
      now,
    ],
  );

  saveDatabase();

  return {
    id,
    workspaceId,
    title: title || "新对话",
    model: model || null,
    modelConfigId: modelConfigId || null,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 按对话/Session ID 读取持久化对话。
 */
export function getConversation(id: string): Conversation | undefined {
  return queryOne<any>("SELECT * FROM conversations WHERE id = ?", [id]);
}

/**
 * 获取工作区下的对话列表，默认隐藏已归档记录。
 *
 * 排序使用 updatedAt，使新消息或设置变更后的对话在 UI 中优先显示。
 */
export function getConversationsByWorkspace(
  workspaceId: string,
  includeArchived = false,
): Conversation[] {
  const query = includeArchived
    ? "SELECT * FROM conversations WHERE workspaceId = ? ORDER BY updatedAt DESC"
    : "SELECT * FROM conversations WHERE workspaceId = ? AND isArchived = 0 ORDER BY updatedAt DESC";
  return queryAll<any>(query, [workspaceId]);
}

/**
 * 更新 UI 可编辑的对话元数据并刷新 updatedAt。
 *
 * 修改 modelConfigId 后，下一次 Runtime 使用会检测 ID 并重建 Agent，避免旧 Provider 继续生效。
 */
export function updateConversation(
  id: string,
  updates: Partial<
    Pick<Conversation, "title" | "model" | "modelConfigId" | "isArchived">
  >,
): Conversation | null {
  const conversation = getConversation(id);
  if (!conversation) return null;

  const db = getDatabase();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.title !== undefined) {
    fields.push("title = ?");
    values.push(updates.title);
  }
  if (updates.model !== undefined) {
    fields.push("model = ?");
    values.push(updates.model);
  }
  if (updates.modelConfigId !== undefined) {
    fields.push("modelConfigId = ?");
    values.push(updates.modelConfigId);
  }
  if (updates.isArchived !== undefined) {
    fields.push("isArchived = ?");
    values.push(updates.isArchived ? 1 : 0);
  }

  fields.push("updatedAt = ?");
  values.push(Date.now());
  values.push(id);

  db.run(`UPDATE conversations SET ${fields.join(", ")} WHERE id = ?`, values);
  saveDatabase();

  return getConversation(id) || null;
}

/**
 * 删除对话并依赖数据库级联清理其消息。
 *
 * 调用方还应关闭同 ID 的 Runtime session，避免持久化记录已删除但内存 Agent 仍可运行。
 */
export function deleteConversation(id: string): boolean {
  const db = getDatabase();
  db.run("DELETE FROM conversations WHERE id = ?", [id]);
  saveDatabase();
  return true;
}
