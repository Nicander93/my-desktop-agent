import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { join } from 'path';
import { app } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { runMigrations } from './migrations';

let db: SqlJsDatabase | null = null;
let dbPath: string = '';
let initPromise: Promise<SqlJsDatabase> | null = null;

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

export function getDatabase(): SqlJsDatabase {
  if (db) return db;
  throw new Error('Database not initialized. Call await getDatabaseAsync() first.');
}

export async function getDatabaseAsync(): Promise<SqlJsDatabase> {
  if (db) return db;
  if (!initPromise) {
    initPromise = initDatabase();
  }
  return initPromise;
}

export function saveDatabase(): void {
  if (db && dbPath) {
    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(dbPath, buffer);
  }
}

export function closeDatabase(): void {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
  }
}
