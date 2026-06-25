/**
 * SQLite 数据库单例（基于 sql.js）
 *
 * 数据库文件位于 app.getPath('userData')/desktop-agent.db
 * 每次写操作后需调用 saveDatabase() 持久化到磁盘
 */
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { join } from 'path';
import { app } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { runMigrations } from './migrations';

let db: SqlJsDatabase | null = null;
let dbPath: string = '';
let initPromise: Promise<SqlJsDatabase> | null = null;

/** 初始化数据库：加载已有文件或创建新库，执行迁移 */
async function initDatabase(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();
  const userDataPath = app.getPath('userData');
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true });
  }
  dbPath = join(userDataPath, 'desktop-agent.db');

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  saveDatabase();
  return db;
}

/** 同步获取数据库实例，须先 await getDatabaseAsync() */
export function getDatabase(): SqlJsDatabase {
  if (db) return db;
  throw new Error('Database not initialized. Call await getDatabaseAsync() first.');
}

/** 异步初始化并返回数据库实例，幂等 */
export async function getDatabaseAsync(): Promise<SqlJsDatabase> {
  if (db) return db;
  if (!initPromise) {
    initPromise = initDatabase();
  }
  return initPromise;
}

/** 将内存中的数据库导出写入磁盘 */
export function saveDatabase(): void {
  if (db && dbPath) {
    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(dbPath, buffer);
  }
}

/** 保存并关闭数据库连接 */
export function closeDatabase(): void {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
  }
}
