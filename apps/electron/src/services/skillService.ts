import { readFileSync, existsSync } from 'fs';
import { getDatabase, saveDatabase } from '../db';
import { v4 as uuidv4 } from 'uuid';
import {
  getSkillCatalogEntry,
  parseSkillMarkdown,
  SKILL_CATALOG,
  type SkillCatalogEntry,
  type SkillInput,
  type SkillRecord,
  type RuntimeSkillDefinition,
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

function rowToRecord(row: Record<string, unknown>): SkillRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    displayName: row.displayName as string,
    description: row.description as string,
    source: row.source as SkillRecord['source'],
    catalogId: (row.catalogId as string | null) ?? null,
    sourcePath: row.sourcePath as string,
    contentCache: (row.contentCache as string) || '',
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

async function fetchSkillContent(sourcePath: string): Promise<string> {
  if (/^https?:\/\//i.test(sourcePath)) {
    const response = await fetch(sourcePath);
    if (!response.ok) {
      throw new Error(`下载失败 (${response.status}): ${sourcePath}`);
    }
    return response.text();
  }

  if (!existsSync(sourcePath)) {
    throw new Error(`文件不存在: ${sourcePath}`);
  }
  return readFileSync(sourcePath, 'utf-8');
}

function resolveSkillMeta(
  raw: string,
  fallback: { name: string; displayName: string; description: string },
): { name: string; displayName: string; description: string } {
  const { frontmatter } = parseSkillMarkdown(raw);
  return {
    name: fallback.name,
    displayName: frontmatter.name || fallback.displayName,
    description: frontmatter.description || fallback.description,
  };
}

export function getAllSkills(): SkillRecord[] {
  const rows = queryAll<Record<string, unknown>>(
    'SELECT * FROM skills ORDER BY sortOrder ASC, createdAt ASC',
  );
  return rows.map(rowToRecord);
}

export function getEnabledSkills(): SkillRecord[] {
  return getAllSkills().filter((skill) => skill.enabled);
}

export function getSkill(id: string): SkillRecord | undefined {
  const row = queryOne<Record<string, unknown>>('SELECT * FROM skills WHERE id = ?', [id]);
  return row ? rowToRecord(row) : undefined;
}

export function getSkillByName(name: string): SkillRecord | undefined {
  const row = queryOne<Record<string, unknown>>('SELECT * FROM skills WHERE name = ?', [name]);
  return row ? rowToRecord(row) : undefined;
}

export function createSkill(input: SkillInput): SkillRecord {
  validateName(input.name);
  if (getSkillByName(input.name)) {
    throw new Error(`Skill 名称 "${input.name}" 已存在`);
  }
  if (!input.contentCache.trim()) {
    throw new Error('Skill 内容不能为空');
  }

  const db = getDatabase();
  const id = uuidv4();
  const now = Date.now();
  const meta = resolveSkillMeta(input.contentCache, {
    name: input.name,
    displayName: input.displayName ?? input.name,
    description: input.description ?? '',
  });

  db.run(
    `INSERT INTO skills (
      id, name, displayName, description, source, catalogId, sourcePath,
      contentCache, enabled, sortOrder, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      meta.displayName,
      meta.description || input.description || '',
      input.source ?? 'url',
      input.catalogId ?? null,
      input.sourcePath,
      input.contentCache,
      input.enabled === false ? 0 : 1,
      0,
      now,
      now,
    ],
  );
  saveDatabase();
  return getSkill(id)!;
}

export function updateSkill(
  id: string,
  updates: Partial<SkillInput> & { enabled?: boolean },
): SkillRecord | undefined {
  const existing = getSkill(id);
  if (!existing) return undefined;

  if (updates.name && updates.name !== existing.name) {
    validateName(updates.name);
    if (getSkillByName(updates.name)) {
      throw new Error(`Skill 名称 "${updates.name}" 已存在`);
    }
  }

  const nextContent = updates.contentCache ?? existing.contentCache;
  const meta = resolveSkillMeta(nextContent, {
    name: updates.name ?? existing.name,
    displayName: updates.displayName ?? existing.displayName,
    description: updates.description ?? existing.description,
  });

  const next: SkillRecord = {
    ...existing,
    name: updates.name ?? existing.name,
    displayName: meta.displayName,
    description: meta.description || updates.description || existing.description,
    sourcePath: updates.sourcePath ?? existing.sourcePath,
    contentCache: nextContent,
    enabled: updates.enabled ?? existing.enabled,
    updatedAt: Date.now(),
  };

  const db = getDatabase();
  db.run(
    `UPDATE skills SET
      name = ?, displayName = ?, description = ?, sourcePath = ?,
      contentCache = ?, enabled = ?, updatedAt = ?
     WHERE id = ?`,
    [
      next.name,
      next.displayName,
      next.description,
      next.sourcePath,
      next.contentCache,
      next.enabled ? 1 : 0,
      next.updatedAt,
      id,
    ],
  );
  saveDatabase();
  return next;
}

export function deleteSkill(id: string): boolean {
  const db = getDatabase();
  db.run('DELETE FROM skills WHERE id = ?', [id]);
  saveDatabase();
  return true;
}

export async function installFromCatalog(catalogId: string): Promise<SkillRecord> {
  const entry = getSkillCatalogEntry(catalogId);
  if (!entry) {
    throw new Error('目录项不存在');
  }
  if (getSkillByName(entry.name)) {
    throw new Error(`Skill "${entry.name}" 已安装`);
  }

  const contentCache = entry.bundledContent ?? await fetchSkillContent(entry.sourcePath);
  return createSkill({
    name: entry.name,
    displayName: entry.displayName,
    description: entry.description,
    source: 'catalog',
    catalogId,
    sourcePath: entry.sourcePath,
    contentCache,
    enabled: true,
  });
}

export async function importFromUrl(name: string, url: string): Promise<SkillRecord> {
  validateName(name);
  if (getSkillByName(name)) {
    throw new Error(`Skill 名称 "${name}" 已存在`);
  }

  const contentCache = await fetchSkillContent(url);
  return createSkill({
    name,
    displayName: name,
    description: '自定义导入',
    source: 'url',
    sourcePath: url,
    contentCache,
    enabled: true,
  });
}

export async function importFromLocalPath(name: string, localPath: string): Promise<SkillRecord> {
  validateName(name);
  if (getSkillByName(name)) {
    throw new Error(`Skill 名称 "${name}" 已存在`);
  }

  const contentCache = await fetchSkillContent(localPath);
  return createSkill({
    name,
    displayName: name,
    description: '本地文件',
    source: 'local',
    sourcePath: localPath,
    contentCache,
    enabled: true,
  });
}

export async function refreshSkillContent(id: string): Promise<SkillRecord | undefined> {
  const existing = getSkill(id);
  if (!existing) return undefined;
  if (existing.source === 'local' && !existsSync(existing.sourcePath)) {
    throw new Error(`文件不存在: ${existing.sourcePath}`);
  }
  if (!/^https?:\/\//i.test(existing.sourcePath) && existing.source !== 'local') {
    throw new Error('仅 URL 或本地 Skill 支持刷新');
  }

  const contentCache = await fetchSkillContent(existing.sourcePath);
  return updateSkill(id, { contentCache });
}

export function listMentionableSkills(): Array<{ name: string; displayName: string }> {
  return getAllSkills().map((skill) => ({
    name: skill.name,
    displayName: skill.displayName,
  }));
}

export function getCatalog(): Array<SkillCatalogEntry & { installed: boolean }> {
  const installed = new Set(getAllSkills().map((skill) => skill.name));
  return SKILL_CATALOG.map((entry) => ({
    ...entry,
    installed: installed.has(entry.name),
  }));
}

export function getRuntimeSkillDefinitions(): RuntimeSkillDefinition[] {
  return getAllSkills().map((skill) => ({
    name: skill.name,
    displayName: skill.displayName,
    description: skill.description,
    contentCache: skill.contentCache,
    enabled: skill.enabled,
  }));
}
