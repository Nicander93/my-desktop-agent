/**
 * SQLite 数据库单例（基于 sql.js）
 *
 * 数据库文件位于 app.getPath('userData')/desktop-agent.db
 * 每次写操作后需调用 saveDatabase() 持久化到磁盘
 */
import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import { join } from "path";
import { app } from "electron";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { runMigrations } from "./migrations";

let db: SqlJsDatabase | null = null;
let dbPath: string = "";
let initPromise: Promise<SqlJsDatabase> | null = null;

/**
 * 初始化进程内 SQLite 实例并恢复持久化文件。
 *
 * 初始化串行执行迁移后立即持久化，确保首次启动创建的 schema 不会只留在内存中。
 */
async function initDatabase(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();
  const userDataPath = app.getPath("userData");
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true });
  }
  dbPath = join(userDataPath, "desktop-agent.db");

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  runMigrations(db);
  saveDatabase();
  return db;
}

/**
 * 获取已经初始化的数据库实例。
 *
 * 服务层使用同步接口以保持查询简洁；应用启动阶段必须先等待 `getDatabaseAsync`，避免在迁移完成前访问旧 schema。
 */
export function getDatabase(): SqlJsDatabase {
  if (db) return db;
  throw new Error(
    "Database not initialized. Call await getDatabaseAsync() first.",
  );
}

/**
 * 异步初始化并返回数据库实例。
 *
 * 并发调用共享同一个 Promise，防止多个调用者同时加载同一文件并互相覆盖内存状态。
 */
export async function getDatabaseAsync(): Promise<SqlJsDatabase> {
  if (db) return db;
  if (!initPromise) {
    initPromise = initDatabase();
  }
  return initPromise;
}

/**
 * 将 sql.js 的内存数据库完整导出到用户数据目录。
 *
 * sql.js 不会自动落盘；所有写操作完成后均应调用此函数，否则重启会丢失改动。
 */
export function saveDatabase(): void {
  if (db && dbPath) {
    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(dbPath, buffer);
  }
}

/**
 * 持久化并关闭数据库连接。
 *
 * 关闭后清空单例，使后续应用生命周期重新初始化而不会复用已关闭实例。
 */
export function closeDatabase(): void {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
  }
}
