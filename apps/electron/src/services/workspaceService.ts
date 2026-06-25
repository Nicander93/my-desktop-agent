/**
 * 工作区数据服务
 *
 * 负责 workspaces 和 workspace_settings 表的 CRUD，
 * 以及路径是否在工作区内的判定逻辑
 */
import { getDatabase, saveDatabase } from '../db';
import { v4 as uuidv4 } from 'uuid';

/** 工作区实体，path 为本地目录绝对路径 */
export interface Workspace {
  id: string;
  name: string;
  path: string;
  description: string;
  icon: string;
  color: string;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
}

/** 工作区路径限制配置 */
export interface WorkspaceSettings {
  workspaceId: string;
  allowedPaths: string[];
  restrictedMode: boolean;
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

/** 创建工作区，同时初始化默认 settings（restrictedMode=1） */
export function createWorkspace(name: string, path: string, description?: string): Workspace {
  const db = getDatabase();
  const id = uuidv4();
  const now = Date.now();

  db.run(
    `INSERT INTO workspaces (id, name, path, description, icon, color, createdAt, updatedAt, lastAccessedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, path, description || '', 'folder', '#6366f1', now, now, now]
  );

  db.run(
    `INSERT INTO workspace_settings (workspaceId, allowedPaths, restrictedMode) VALUES (?, '[]', 1)`,
    [id]
  );

  saveDatabase();

  return {
    id, name, path, description: description || '',
    icon: 'folder', color: '#6366f1',
    createdAt: now, updatedAt: now, lastAccessedAt: now
  };
}

export function getWorkspace(id: string): Workspace | undefined {
  return queryOne<Workspace>('SELECT * FROM workspaces WHERE id = ?', [id]);
}

export function getWorkspaceByPath(path: string): Workspace | undefined {
  return queryOne<Workspace>('SELECT * FROM workspaces WHERE path = ?', [path]);
}

/** 按最近访问时间倒序 */
export function getAllWorkspaces(): Workspace[] {
  return queryAll<Workspace>('SELECT * FROM workspaces ORDER BY lastAccessedAt DESC');
}

export function updateWorkspace(id: string, updates: Partial<Pick<Workspace, 'name' | 'description' | 'icon' | 'color'>>): Workspace | null {
  const workspace = getWorkspace(id);
  if (!workspace) return null;

  const db = getDatabase();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.icon !== undefined) { fields.push('icon = ?'); values.push(updates.icon); }
  if (updates.color !== undefined) { fields.push('color = ?'); values.push(updates.color); }

  fields.push('updatedAt = ?');
  values.push(Date.now());
  values.push(id);

  db.run(`UPDATE workspaces SET ${fields.join(', ')} WHERE id = ?`, values);
  saveDatabase();

  return getWorkspace(id) || null;
}

/** 删除工作区，级联删除 conversations / messages / settings */
export function deleteWorkspace(id: string): boolean {
  const db = getDatabase();
  db.run('DELETE FROM workspaces WHERE id = ?', [id]);
  saveDatabase();
  return true;
}

/** 更新 lastAccessedAt，用于侧边栏排序 */
export function touchWorkspace(id: string): void {
  const db = getDatabase();
  db.run('UPDATE workspaces SET lastAccessedAt = ? WHERE id = ?', [Date.now(), id]);
  saveDatabase();
}

export function getWorkspaceSettings(workspaceId: string): WorkspaceSettings | undefined {
  const row = queryOne<any>('SELECT * FROM workspace_settings WHERE workspaceId = ?', [workspaceId]);
  if (!row) return undefined;
  return {
    workspaceId: row.workspaceId,
    allowedPaths: JSON.parse(row.allowedPaths || '[]'),
    restrictedMode: row.restrictedMode === 1
  };
}

export function updateWorkspaceSettings(workspaceId: string, settings: Partial<Pick<WorkspaceSettings, 'allowedPaths' | 'restrictedMode'>>): void {
  const db = getDatabase();
  const current = getWorkspaceSettings(workspaceId);

  if (!current) {
    db.run(
      `INSERT INTO workspace_settings (workspaceId, allowedPaths, restrictedMode) VALUES (?, ?, ?)`,
      [workspaceId, JSON.stringify(settings.allowedPaths || []), settings.restrictedMode === false ? 0 : 1]
    );
  } else {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (settings.allowedPaths !== undefined) { updates.push('allowedPaths = ?'); values.push(JSON.stringify(settings.allowedPaths)); }
    if (settings.restrictedMode !== undefined) { updates.push('restrictedMode = ?'); values.push(settings.restrictedMode ? 1 : 0); }
    if (updates.length > 0) { values.push(workspaceId); db.run(`UPDATE workspace_settings SET ${updates.join(', ')} WHERE workspaceId = ?`, values); }
  }
  saveDatabase();
}

/**
 * 判断目标路径是否在工作区或额外允许路径内
 * 支持目录前缀匹配（含 / 和 \）
 */
export function isPathInWorkspace(workspacePath: string, targetPath: string, allowedPaths: string[] = []): boolean {
  const normalizedWorkspace = workspacePath.replace(/[\/\\]$/, '');
  const normalizedTarget = targetPath.replace(/[\/\\]$/, '');

  if (normalizedTarget === normalizedWorkspace || normalizedTarget.startsWith(normalizedWorkspace + '/') || normalizedTarget.startsWith(normalizedWorkspace + '\\')) {
    return true;
  }

  for (const allowed of allowedPaths) {
    const normalizedAllowed = allowed.replace(/[\/\\]$/, '');
    if (normalizedTarget === normalizedAllowed || normalizedTarget.startsWith(normalizedAllowed + '/') || normalizedTarget.startsWith(normalizedAllowed + '\\')) {
      return true;
    }
  }

  return false;
}
