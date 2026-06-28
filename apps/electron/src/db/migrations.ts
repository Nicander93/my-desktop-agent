/**
 * 数据库版本化迁移
 *
 * 通过 _migrations 表记录已执行版本，新增迁移只需追加 version 递增的条目
 */
import { Database as SqlJsDatabase } from 'sql.js';

interface Migration {
  version: number;
  up: string;
}

/** 迁移脚本列表，version 必须递增 */
const migrations: Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        description TEXT DEFAULT '',
        icon TEXT DEFAULT 'folder',
        color TEXT DEFAULT '#6366f1',
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        lastAccessedAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_workspaces_path ON workspaces(path);

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        workspaceId TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '新对话',
        model TEXT,
        isArchived INTEGER DEFAULT 0,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY (workspaceId) REFERENCES workspaces(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspaceId);
      CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updatedAt DESC);

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversationId TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
        content TEXT NOT NULL DEFAULT '',
        toolCalls TEXT,
        metadata TEXT,
        createdAt INTEGER NOT NULL,
        FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversationId, createdAt);

      CREATE TABLE IF NOT EXISTS workspace_settings (
        workspaceId TEXT PRIMARY KEY,
        allowedPaths TEXT DEFAULT '[]',
        restrictedMode INTEGER DEFAULT 1,
        FOREIGN KEY (workspaceId) REFERENCES workspaces(id) ON DELETE CASCADE
      );
    `
  },
  {
    version: 2,
    up: `
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        displayName TEXT NOT NULL,
        description TEXT DEFAULT '',
        source TEXT NOT NULL CHECK(source IN ('catalog', 'custom')),
        catalogId TEXT,
        transport TEXT NOT NULL CHECK(transport IN ('stdio', 'sse', 'http')),
        command TEXT,
        args TEXT DEFAULT '[]',
        url TEXT,
        env TEXT DEFAULT '{}',
        enabled INTEGER DEFAULT 1,
        sortOrder INTEGER DEFAULT 0,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON mcp_servers(enabled);
    `
  }
];

/** 执行尚未应用的迁移 */
export function runMigrations(db: SqlJsDatabase): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      appliedAt INTEGER NOT NULL
    )
  `);

  const appliedResult = db.exec('SELECT version FROM _migrations');
  const appliedVersions = new Set<number>();
  if (appliedResult.length > 0) {
    for (const row of appliedResult[0].values) {
      appliedVersions.add(row[0] as number);
    }
  }

  for (const migration of migrations) {
    if (!appliedVersions.has(migration.version)) {
      db.run(migration.up);
      db.run('INSERT INTO _migrations (version, appliedAt) VALUES (?, ?)', [migration.version, Date.now()]);
    }
  }
}
