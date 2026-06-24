import { getDatabase, saveDatabase } from '../db';
import { v4 as uuidv4 } from 'uuid';

export interface Conversation {
  id: string;
  workspaceId: string;
  title: string;
  model: string | null;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
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

export function createConversation(workspaceId: string, title?: string, model?: string): Conversation {
  const db = getDatabase();
  const id = uuidv4();
  const now = Date.now();

  db.run(
    `INSERT INTO conversations (id, workspaceId, title, model, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, workspaceId, title || '新对话', model || null, now, now]
  );

  saveDatabase();

  return { id, workspaceId, title: title || '新对话', model: model || null, isArchived: false, createdAt: now, updatedAt: now };
}

export function getConversation(id: string): Conversation | undefined {
  return queryOne<any>('SELECT * FROM conversations WHERE id = ?', [id]);
}

export function getConversationsByWorkspace(workspaceId: string, includeArchived = false): Conversation[] {
  const query = includeArchived
    ? 'SELECT * FROM conversations WHERE workspaceId = ? ORDER BY updatedAt DESC'
    : 'SELECT * FROM conversations WHERE workspaceId = ? AND isArchived = 0 ORDER BY updatedAt DESC';
  return queryAll<any>(query, [workspaceId]);
}

export function updateConversation(id: string, updates: Partial<Pick<Conversation, 'title' | 'model' | 'isArchived'>>): Conversation | null {
  const conversation = getConversation(id);
  if (!conversation) return null;

  const db = getDatabase();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
  if (updates.model !== undefined) { fields.push('model = ?'); values.push(updates.model); }
  if (updates.isArchived !== undefined) { fields.push('isArchived = ?'); values.push(updates.isArchived ? 1 : 0); }

  fields.push('updatedAt = ?');
  values.push(Date.now());
  values.push(id);

  db.run(`UPDATE conversations SET ${fields.join(', ')} WHERE id = ?`, values);
  saveDatabase();

  return getConversation(id) || null;
}

export function deleteConversation(id: string): boolean {
  const db = getDatabase();
  db.run('DELETE FROM conversations WHERE id = ?', [id]);
  saveDatabase();
  return true;
}
