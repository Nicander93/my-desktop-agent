/**
 * 消息数据服务
 *
 * 消息归属对话，toolCalls 和 metadata 以 JSON 字符串存储
 */
import { getDatabase, saveDatabase } from "../db";
import { v4 as uuidv4 } from "uuid";

/**
 * 持久化的对话消息实体。
 *
 * 工具调用和 trace 等扩展信息存于 JSON metadata；二进制附件只保存引用，不能嵌入 content 或 metadata。
 */
export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls: unknown[];
  metadata: Record<string, unknown>;
  createdAt: number;
}

/**
 * 执行多行 SQLite 查询并释放 statement。
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
 * 执行最多返回一行的 SQLite 查询。
 */
function queryOne<T>(sql: string, params: any[] = []): T | undefined {
  const results = queryAll<T>(sql, params);
  return results[0];
}

/**
 * 创建并立即持久化一条对话消息。
 *
 * 可选 ID 用于 renderer 在流式完成后稳定地更新占位 assistant 消息，调用方必须确保其在对话内唯一。
 */
export function createMessage(
  conversationId: string,
  role: Message["role"],
  content: string,
  toolCalls?: unknown[],
  metadata?: Record<string, unknown>,
  id?: string,
): Message {
  const db = getDatabase();
  const messageId = id || uuidv4();
  const now = Date.now();

  db.run(
    `INSERT INTO messages (id, conversationId, role, content, toolCalls, metadata, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      messageId,
      conversationId,
      role,
      content,
      JSON.stringify(toolCalls || []),
      JSON.stringify(metadata || {}),
      now,
    ],
  );

  saveDatabase();

  return {
    id: messageId,
    conversationId,
    role,
    content,
    toolCalls: toolCalls || [],
    metadata: metadata || {},
    createdAt: now,
  };
}

/**
 * 按创建时间正序读取对话消息，并在读取边界反序列化 JSON 字段。
 *
 * 时间顺序是 Agent 历史重放的基础；分页只用于 UI 加载，不能打乱消息时间线。
 */
export function getMessagesByConversation(
  conversationId: string,
  limit?: number,
  offset?: number,
): Message[] {
  let query =
    "SELECT * FROM messages WHERE conversationId = ? ORDER BY createdAt ASC";
  const params: unknown[] = [conversationId];

  if (limit) {
    query += " LIMIT ?";
    params.push(limit);
    if (offset) {
      query += " OFFSET ?";
      params.push(offset);
    }
  }

  const rows = queryAll<any>(query, params);
  return rows.map((row) => ({
    ...row,
    toolCalls: JSON.parse(row.toolCalls || "[]"),
    metadata: JSON.parse(row.metadata || "{}"),
  }));
}

/**
 * 局部更新已持久化消息的文本、工具调用或元数据。
 *
 * 常用于流式结束后的最终 assistant 快照；不对每个 token 持久化，避免数据库写放大。
 */
export function updateMessage(
  id: string,
  updates: Partial<Pick<Message, "content" | "toolCalls" | "metadata">>,
): Message | null {
  const db = getDatabase();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.content !== undefined) {
    fields.push("content = ?");
    values.push(updates.content);
  }
  if (updates.toolCalls !== undefined) {
    fields.push("toolCalls = ?");
    values.push(JSON.stringify(updates.toolCalls));
  }
  if (updates.metadata !== undefined) {
    fields.push("metadata = ?");
    values.push(JSON.stringify(updates.metadata));
  }

  if (fields.length === 0) return null;
  values.push(id);
  db.run(`UPDATE messages SET ${fields.join(", ")} WHERE id = ?`, values);
  saveDatabase();

  return queryOne<Message>("SELECT * FROM messages WHERE id = ?", [id]) || null;
}

/**
 * 删除一个对话的全部消息。
 *
 * 通常由对话删除级联处理；此函数仅供显式清空历史的 Service/IPC 路径使用。
 */
export function deleteMessagesByConversation(conversationId: string): boolean {
  const db = getDatabase();
  db.run("DELETE FROM messages WHERE conversationId = ?", [conversationId]);
  saveDatabase();
  return true;
}
