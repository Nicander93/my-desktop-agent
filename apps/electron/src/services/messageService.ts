import { getDatabase, saveDatabase } from '../db';
import { v4 as uuidv4 } from 'uuid';

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls: unknown[];
  metadata: Record<string, unknown>;
  createdAt: number;
}

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

function queryOne<T>(sql: string, params: any[] = []): T | undefined {
  const results = queryAll<T>(sql, params);
  return results[0];
}

export function createMessage(
  conversationId: string,
  role: Message['role'],
  content: string,
  toolCalls?: unknown[],
  metadata?: Record<string, unknown>
): Message {
  const db = getDatabase();
  const id = uuidv4();
  const now = Date.now();

  db.run(
    `INSERT INTO messages (id, conversationId, role, content, toolCalls, metadata, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, conversationId, role, content, JSON.stringify(toolCalls || []), JSON.stringify(metadata || {}), now]
  );

  saveDatabase();

  return { id, conversationId, role, content, toolCalls: toolCalls || [], metadata: metadata || {}, createdAt: now };
}

export function getMessagesByConversation(conversationId: string, limit?: number, offset?: number): Message[] {
  let query = 'SELECT * FROM messages WHERE conversationId = ? ORDER BY createdAt ASC';
  const params: unknown[] = [conversationId];

  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
    if (offset) { query += ' OFFSET ?'; params.push(offset); }
  }

  const rows = queryAll<any>(query, params);
  return rows.map(row => ({
    ...row,
    toolCalls: JSON.parse(row.toolCalls || '[]'),
    metadata: JSON.parse(row.metadata || '{}')
  }));
}

export function updateMessage(id: string, updates: Partial<Pick<Message, 'content' | 'toolCalls' | 'metadata'>>): Message | null {
  const db = getDatabase();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.content !== undefined) { fields.push('content = ?'); values.push(updates.content); }
  if (updates.toolCalls !== undefined) { fields.push('toolCalls = ?'); values.push(JSON.stringify(updates.toolCalls)); }
  if (updates.metadata !== undefined) { fields.push('metadata = ?'); values.push(JSON.stringify(updates.metadata)); }

  if (fields.length === 0) return null;
  values.push(id);
  db.run(`UPDATE messages SET ${fields.join(', ')} WHERE id = ?`, values);
  saveDatabase();

  return queryOne<Message>('SELECT * FROM messages WHERE id = ?', [id]) || null;
}

export function deleteMessagesByConversation(conversationId: string): boolean {
  const db = getDatabase();
  db.run('DELETE FROM messages WHERE conversationId = ?', [conversationId]);
  saveDatabase();
  return true;
}
