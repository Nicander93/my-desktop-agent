import { getDatabase, saveDatabase } from '../db';
import { v4 as uuidv4 } from 'uuid';
import {
  getCatalogEntry,
  importConfigToServerInput,
  MCP_CATALOG,
  type McpCatalogEntry,
  type McpImportServerConfig,
  type McpServerInput,
  type McpServerRecord,
} from '@desktop-agent/shared';

function queryAll<T>(sql: string, params: unknown[] = []): T[] {
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

function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  return queryAll<T>(sql, params)[0];
}

function rowToRecord(row: Record<string, unknown>): McpServerRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    displayName: row.displayName as string,
    description: row.description as string,
    source: row.source as McpServerRecord['source'],
    catalogId: (row.catalogId as string | null) ?? null,
    transport: row.transport as McpServerRecord['transport'],
    command: (row.command as string | null) ?? null,
    args: JSON.parse((row.args as string) || '[]') as string[],
    url: (row.url as string | null) ?? null,
    env: JSON.parse((row.env as string) || '{}') as Record<string, string>,
    enabled: Boolean(row.enabled),
    sortOrder: Number(row.sortOrder ?? 0),
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

function validateName(name: string): void {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
    throw new Error('名称需以字母开头，仅含字母、数字、_、-');
  }
}

export function getAllMcpServers(): McpServerRecord[] {
  const rows = queryAll<Record<string, unknown>>(
    'SELECT * FROM mcp_servers ORDER BY sortOrder ASC, createdAt ASC',
  );
  return rows.map(rowToRecord);
}

export function getEnabledMcpServers(): McpServerRecord[] {
  return getAllMcpServers().filter((server) => server.enabled);
}

export function getMcpServer(id: string): McpServerRecord | undefined {
  const row = queryOne<Record<string, unknown>>('SELECT * FROM mcp_servers WHERE id = ?', [id]);
  return row ? rowToRecord(row) : undefined;
}

export function getMcpServerByName(name: string): McpServerRecord | undefined {
  const row = queryOne<Record<string, unknown>>('SELECT * FROM mcp_servers WHERE name = ?', [name]);
  return row ? rowToRecord(row) : undefined;
}

export function createMcpServer(input: McpServerInput): McpServerRecord {
  validateName(input.name);
  if (getMcpServerByName(input.name)) {
    throw new Error(`MCP 名称 "${input.name}" 已存在`);
  }

  const db = getDatabase();
  const id = uuidv4();
  const now = Date.now();

  db.run(
    `INSERT INTO mcp_servers (
      id, name, displayName, description, source, catalogId, transport,
      command, args, url, env, enabled, sortOrder, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.displayName ?? input.name,
      input.description ?? '',
      input.source ?? 'custom',
      input.catalogId ?? null,
      input.transport,
      input.command ?? null,
      JSON.stringify(input.args ?? []),
      input.url ?? null,
      JSON.stringify(input.env ?? {}),
      input.enabled === false ? 0 : 1,
      0,
      now,
      now,
    ],
  );
  saveDatabase();
  return getMcpServer(id)!;
}

export function updateMcpServer(
  id: string,
  updates: Partial<McpServerInput>,
): McpServerRecord | undefined {
  const existing = getMcpServer(id);
  if (!existing) return undefined;

  if (updates.name && updates.name !== existing.name) {
    validateName(updates.name);
    if (getMcpServerByName(updates.name)) {
      throw new Error(`MCP 名称 "${updates.name}" 已存在`);
    }
  }

  const next: McpServerRecord = {
    ...existing,
    name: updates.name ?? existing.name,
    displayName: updates.displayName ?? existing.displayName,
    description: updates.description ?? existing.description,
    transport: updates.transport ?? existing.transport,
    command: updates.command === undefined ? existing.command : updates.command,
    args: updates.args ?? existing.args,
    url: updates.url === undefined ? existing.url : updates.url,
    env: updates.env ?? existing.env,
    enabled: updates.enabled ?? existing.enabled,
    updatedAt: Date.now(),
  };

  const db = getDatabase();
  db.run(
    `UPDATE mcp_servers SET
      name = ?, displayName = ?, description = ?, transport = ?,
      command = ?, args = ?, url = ?, env = ?, enabled = ?, updatedAt = ?
     WHERE id = ?`,
    [
      next.name,
      next.displayName,
      next.description,
      next.transport,
      next.command,
      JSON.stringify(next.args),
      next.url,
      JSON.stringify(next.env),
      next.enabled ? 1 : 0,
      next.updatedAt,
      id,
    ],
  );
  saveDatabase();
  return next;
}

export function deleteMcpServer(id: string): boolean {
  const db = getDatabase();
  db.run('DELETE FROM mcp_servers WHERE id = ?', [id]);
  saveDatabase();
  return true;
}

export function installFromCatalog(catalogId: string, secrets?: Record<string, string>): McpServerRecord {
  const entry = getCatalogEntry(catalogId);
  if (!entry) {
    throw new Error('目录项不存在');
  }

  if (getMcpServerByName(catalogId)) {
    throw new Error(`MCP "${catalogId}" 已安装`);
  }

  return createMcpServer({
    name: catalogId,
    displayName: entry.displayName,
    description: entry.description,
    source: 'catalog',
    catalogId,
    transport: entry.transport,
    command: entry.template.command ?? null,
    args: entry.template.args ?? [],
    url: entry.template.url ?? null,
    env: resolveTemplateEnv(entry.template.env, secrets),
    enabled: true,
  });
}

function resolveTemplateEnv(
  templateEnv: Record<string, string> | undefined,
  secrets?: Record<string, string>,
): Record<string, string> {
  if (!templateEnv) return {};
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(templateEnv)) {
    let resolved = value;
    if (secrets) {
      for (const [secretKey, secretValue] of Object.entries(secrets)) {
        resolved = resolved.replace(new RegExp(`\\{${secretKey}\\}`, 'g'), secretValue);
      }
    }
    env[key] = resolved;
  }
  return env;
}

export function importMcpServer(name: string, config: McpImportServerConfig): McpServerRecord {
  const parsed = importConfigToServerInput(name, config);
  return createMcpServer({
    name: parsed.name,
    displayName: parsed.name,
    description: '自定义导入',
    source: 'custom',
    transport: parsed.transport,
    command: parsed.command,
    args: parsed.args,
    url: parsed.url,
    env: parsed.env,
    enabled: true,
  });
}

export function listMentionableServers(): Array<{ name: string; displayName: string }> {
  return getEnabledMcpServers().map((server) => ({
    name: server.name,
    displayName: server.displayName,
  }));
}

export function getCatalog(): Array<McpCatalogEntry & { installed: boolean }> {
  const installed = new Set(getAllMcpServers().map((server) => server.name));
  return MCP_CATALOG.map((entry) => ({
    ...entry,
    installed: installed.has(entry.id),
  }));
}
