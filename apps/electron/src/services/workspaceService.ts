/**
 * 工作区数据服务
 *
 * 负责 workspaces 和 workspace_settings 表的 CRUD，
 * 以及路径是否在工作区内的判定逻辑
 */
import { getDatabase, saveDatabase } from "../db";
import { v4 as uuidv4 } from "uuid";

/**
 * 持久化的工作区实体。
 *
 * `path` 是 Host 持有的本地绝对目录，也是会话 cwd 与路径授权判定的根，不得由 renderer 自行拼接。
 */
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

/**
 * 工作区的额外路径授权配置。
 *
 * `allowedPaths` 只在 restrictedMode 下作为工作区外的显式例外；实际工具调用仍由 pathGuard 询问此数据。
 */
export interface WorkspaceSettings {
  workspaceId: string;
  allowedPaths: string[];
  restrictedMode: boolean;
}

/**
 * 执行返回多行的 SQLite 查询，并在读取后释放 statement。
 *
 * Service 层统一使用该帮助函数，避免 statement 泄漏和原始数据库对象扩散到 IPC 层。
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
 * 执行最多取第一行的 SQLite 查询。
 *
 * 未找到时返回 undefined，由调用方按各自 IPC 语义转换为 null 或错误响应。
 */
function queryOne<T>(sql: string, params: any[] = []): T | undefined {
  const results = queryAll<T>(sql, params);
  return results[0];
}

/**
 * 创建工作区及其默认受限路径配置，并立即持久化。
 *
 * restrictedMode 默认开启，防止新工作区在未显式授权前访问工作区外的路径。
 */
export function createWorkspace(
  name: string,
  path: string,
  description?: string,
): Workspace {
  const db = getDatabase();
  const id = uuidv4();
  const now = Date.now();

  db.run(
    `INSERT INTO workspaces (id, name, path, description, icon, color, createdAt, updatedAt, lastAccessedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, path, description || "", "folder", "#6366f1", now, now, now],
  );

  db.run(
    `INSERT INTO workspace_settings (workspaceId, allowedPaths, restrictedMode) VALUES (?, '[]', 1)`,
    [id],
  );

  saveDatabase();

  return {
    id,
    name,
    path,
    description: description || "",
    icon: "folder",
    color: "#6366f1",
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
  };
}

/**
 * 按稳定 ID 读取工作区。
 */
export function getWorkspace(id: string): Workspace | undefined {
  return queryOne<Workspace>("SELECT * FROM workspaces WHERE id = ?", [id]);
}

/**
 * 按本地绝对路径读取工作区，用于避免重复注册同一路径。
 */
export function getWorkspaceByPath(path: string): Workspace | undefined {
  return queryOne<Workspace>("SELECT * FROM workspaces WHERE path = ?", [path]);
}

/**
 * 按最近访问时间倒序返回全部工作区，供侧边栏显示。
 */
export function getAllWorkspaces(): Workspace[] {
  return queryAll<Workspace>(
    "SELECT * FROM workspaces ORDER BY lastAccessedAt DESC",
  );
}

/**
 * 更新允许由 UI 修改的展示字段，并刷新更新时间。
 *
 * 不允许通过该方法修改工作区路径，避免已绑定会话与路径授权缓存失去一致性。
 */
export function updateWorkspace(
  id: string,
  updates: Partial<Pick<Workspace, "name" | "description" | "icon" | "color">>,
): Workspace | null {
  const workspace = getWorkspace(id);
  if (!workspace) return null;

  const db = getDatabase();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push("description = ?");
    values.push(updates.description);
  }
  if (updates.icon !== undefined) {
    fields.push("icon = ?");
    values.push(updates.icon);
  }
  if (updates.color !== undefined) {
    fields.push("color = ?");
    values.push(updates.color);
  }

  fields.push("updatedAt = ?");
  values.push(Date.now());
  values.push(id);

  db.run(`UPDATE workspaces SET ${fields.join(", ")} WHERE id = ?`, values);
  saveDatabase();

  return getWorkspace(id) || null;
}

/**
 * 删除工作区并依赖数据库级联清理关联会话、消息和设置。
 *
 * 该操作不可恢复；调用方负责在 IPC/UI 层取得用户确认。
 */
export function deleteWorkspace(id: string): boolean {
  const db = getDatabase();
  db.run("DELETE FROM workspaces WHERE id = ?", [id]);
  saveDatabase();
  return true;
}

/**
 * 更新最近访问时间，以维持侧边栏的稳定排序。
 */
export function touchWorkspace(id: string): void {
  const db = getDatabase();
  db.run("UPDATE workspaces SET lastAccessedAt = ? WHERE id = ?", [
    Date.now(),
    id,
  ]);
  saveDatabase();
}

/**
 * 读取并反序列化工作区路径授权设置。
 */
export function getWorkspaceSettings(
  workspaceId: string,
): WorkspaceSettings | undefined {
  const row = queryOne<any>(
    "SELECT * FROM workspace_settings WHERE workspaceId = ?",
    [workspaceId],
  );
  if (!row) return undefined;
  return {
    workspaceId: row.workspaceId,
    allowedPaths: JSON.parse(row.allowedPaths || "[]"),
    restrictedMode: row.restrictedMode === 1,
  };
}

/**
 * 插入或局部更新工作区路径授权设置，并立即持久化。
 *
 * 缺失记录时以受限模式创建，避免调用方仅更新 allowedPaths 时意外关闭限制。
 */
export function updateWorkspaceSettings(
  workspaceId: string,
  settings: Partial<Pick<WorkspaceSettings, "allowedPaths" | "restrictedMode">>,
): void {
  const db = getDatabase();
  const current = getWorkspaceSettings(workspaceId);

  if (!current) {
    db.run(
      `INSERT INTO workspace_settings (workspaceId, allowedPaths, restrictedMode) VALUES (?, ?, ?)`,
      [
        workspaceId,
        JSON.stringify(settings.allowedPaths || []),
        settings.restrictedMode === false ? 0 : 1,
      ],
    );
  } else {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (settings.allowedPaths !== undefined) {
      updates.push("allowedPaths = ?");
      values.push(JSON.stringify(settings.allowedPaths));
    }
    if (settings.restrictedMode !== undefined) {
      updates.push("restrictedMode = ?");
      values.push(settings.restrictedMode ? 1 : 0);
    }
    if (updates.length > 0) {
      values.push(workspaceId);
      db.run(
        `UPDATE workspace_settings SET ${updates.join(", ")} WHERE workspaceId = ?`,
        values,
      );
    }
  }
  saveDatabase();
}

/**
 * 判断目标路径是否位于工作区或显式允许的目录内。
 *
 * 仅做分隔符兼容的目录前缀匹配；调用方应先确保路径已规范化，避免相对路径或符号链接绕过授权。
 */
export function isPathInWorkspace(
  workspacePath: string,
  targetPath: string,
  allowedPaths: string[] = [],
): boolean {
  const normalizedWorkspace = workspacePath.replace(/[\/\\]$/, "");
  const normalizedTarget = targetPath.replace(/[\/\\]$/, "");

  if (
    normalizedTarget === normalizedWorkspace ||
    normalizedTarget.startsWith(normalizedWorkspace + "/") ||
    normalizedTarget.startsWith(normalizedWorkspace + "\\")
  ) {
    return true;
  }

  for (const allowed of allowedPaths) {
    const normalizedAllowed = allowed.replace(/[\/\\]$/, "");
    if (
      normalizedTarget === normalizedAllowed ||
      normalizedTarget.startsWith(normalizedAllowed + "/") ||
      normalizedTarget.startsWith(normalizedAllowed + "\\")
    ) {
      return true;
    }
  }

  return false;
}
