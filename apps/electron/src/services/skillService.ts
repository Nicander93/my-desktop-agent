/**
 * Skill 持久化与内容缓存
 *
 * 正文缓存在 contentCache；URL/本地源支持 refresh 重拉
 */
import { readFileSync, existsSync } from "fs";
import { getDatabase, saveDatabase } from "../db";
import { v4 as uuidv4 } from "uuid";
import {
  getSkillCatalogEntry,
  parseSkillMarkdown,
  SKILL_CATALOG,
  type SkillCatalogEntry,
  type SkillInput,
  type SkillRecord,
  type RuntimeSkillDefinition,
} from "@desktop-agent/shared";

/** 执行多行参数化查询并释放 statement，避免长期服务累积 sql.js 资源。 */
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

/** 返回查询首行，供按 ID 或唯一名称读取。 */
function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  return queryAll<T>(sql, params)[0];
}

/** 将数据库弱类型行还原为 renderer/运行时共享的 SkillRecord。 */
function rowToRecord(row: Record<string, unknown>): SkillRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    displayName: row.displayName as string,
    description: row.description as string,
    source: row.source as SkillRecord["source"],
    catalogId: (row.catalogId as string | null) ?? null,
    sourcePath: row.sourcePath as string,
    contentCache: (row.contentCache as string) || "",
    enabled: Boolean(row.enabled),
    sortOrder: Number(row.sortOrder ?? 0),
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

/** 校验 Skill 名称可作为稳定标识与提示词引用，不接受空白或路径字符。 */
function validateName(name: string): void {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
    throw new Error("名称需以字母开头，仅含字母、数字、_、-");
  }
}

/** 从 HTTP 或本地来源读取正文；调用者负责将成功结果写入 contentCache。 */
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
  return readFileSync(sourcePath, "utf-8");
}

/** 优先采用 SKILL.md frontmatter 的展示元数据，同时保留输入值作为兼容回退。 */
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

/** 按用户定义顺序读取所有已保存 Skill。 */
export function getAllSkills(): SkillRecord[] {
  const rows = queryAll<Record<string, unknown>>(
    "SELECT * FROM skills ORDER BY sortOrder ASC, createdAt ASC",
  );
  return rows.map(rowToRecord);
}

/** 返回运行时可注入 Agent 的启用 Skill。 */
export function getEnabledSkills(): SkillRecord[] {
  return getAllSkills().filter((skill) => skill.enabled);
}

/** 按主键查询 Skill。 */
export function getSkill(id: string): SkillRecord | undefined {
  const row = queryOne<Record<string, unknown>>(
    "SELECT * FROM skills WHERE id = ?",
    [id],
  );
  return row ? rowToRecord(row) : undefined;
}

/** 按全局唯一名称查询，用于避免安装和重命名冲突。 */
export function getSkillByName(name: string): SkillRecord | undefined {
  const row = queryOne<Record<string, unknown>>(
    "SELECT * FROM skills WHERE name = ?",
    [name],
  );
  return row ? rowToRecord(row) : undefined;
}

/** 创建带缓存正文的 Skill；正文为空时拒绝写入不可运行配置。 */
export function createSkill(input: SkillInput): SkillRecord {
  validateName(input.name);
  if (getSkillByName(input.name)) {
    throw new Error(`Skill 名称 "${input.name}" 已存在`);
  }
  if (!input.contentCache.trim()) {
    throw new Error("Skill 内容不能为空");
  }

  const db = getDatabase();
  const id = uuidv4();
  const now = Date.now();
  const meta = resolveSkillMeta(input.contentCache, {
    name: input.name,
    displayName: input.displayName ?? input.name,
    description: input.description ?? "",
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
      meta.description || input.description || "",
      input.source ?? "url",
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

/** 更新 Skill 并重新解析缓存正文的 frontmatter，保持展示信息与正文一致。 */
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
    description:
      meta.description || updates.description || existing.description,
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

/** 删除 Skill 记录；缓存仅在数据库中保存，无额外文件需要清理。 */
export function deleteSkill(id: string): boolean {
  const db = getDatabase();
  db.run("DELETE FROM skills WHERE id = ?", [id]);
  saveDatabase();
  return true;
}

/** 按内置目录安装，优先用 bundledContent 避免网络请求 */
/** 从内置目录安装 Skill，优先采用随包正文以支持离线使用。 */
export async function installFromCatalog(
  catalogId: string,
): Promise<SkillRecord> {
  const entry = getSkillCatalogEntry(catalogId);
  if (!entry) {
    throw new Error("目录项不存在");
  }
  if (getSkillByName(entry.name)) {
    throw new Error(`Skill "${entry.name}" 已安装`);
  }

  const contentCache =
    entry.bundledContent ?? (await fetchSkillContent(entry.sourcePath));
  return createSkill({
    name: entry.name,
    displayName: entry.displayName,
    description: entry.description,
    source: "catalog",
    catalogId,
    sourcePath: entry.sourcePath,
    contentCache,
    enabled: true,
  });
}

/** 从 URL 拉取 SKILL.md 正文并入库；网络读取失败不会留下半成品记录。 */
export async function importFromUrl(
  name: string,
  url: string,
): Promise<SkillRecord> {
  validateName(name);
  if (getSkillByName(name)) {
    throw new Error(`Skill 名称 "${name}" 已存在`);
  }

  const contentCache = await fetchSkillContent(url);
  return createSkill({
    name,
    displayName: name,
    description: "自定义导入",
    source: "url",
    sourcePath: url,
    contentCache,
    enabled: true,
  });
}

/** 从本地路径读取 SKILL.md 并复制正文到数据库缓存。 */
export async function importFromLocalPath(
  name: string,
  localPath: string,
): Promise<SkillRecord> {
  validateName(name);
  if (getSkillByName(name)) {
    throw new Error(`Skill 名称 "${name}" 已存在`);
  }

  const contentCache = await fetchSkillContent(localPath);
  return createSkill({
    name,
    displayName: name,
    description: "本地文件",
    source: "local",
    sourcePath: localPath,
    contentCache,
    enabled: true,
  });
}

/** 按 sourcePath 刷新正文；目录项依赖 bundledContent，因此不允许被外部来源覆盖。 */
export async function refreshSkillContent(
  id: string,
): Promise<SkillRecord | undefined> {
  const existing = getSkill(id);
  if (!existing) return undefined;
  if (existing.source === "local" && !existsSync(existing.sourcePath)) {
    throw new Error(`文件不存在: ${existing.sourcePath}`);
  }
  if (
    !/^https?:\/\//i.test(existing.sourcePath) &&
    existing.source !== "local"
  ) {
    throw new Error("仅 URL 或本地 Skill 支持刷新");
  }

  const contentCache = await fetchSkillContent(existing.sourcePath);
  return updateSkill(id, { contentCache });
}

/** 返回可在聊天输入中被提及的最小 Skill 描述，避免泄漏正文缓存。 */
export function listMentionableSkills(): Array<{
  name: string;
  displayName: string;
}> {
  return getAllSkills().map((skill) => ({
    name: skill.name,
    displayName: skill.displayName,
  }));
}

/** 返回内置目录及当前安装状态，供设置页区分可安装项目。 */
export function getCatalog(): Array<
  SkillCatalogEntry & { installed: boolean }
> {
  const installed = new Set(getAllSkills().map((skill) => skill.name));
  return SKILL_CATALOG.map((entry) => ({
    ...entry,
    installed: installed.has(entry.name),
  }));
}

/** 构造供 Agent 注入的 Skill 定义，正文保留在主进程运行时边界内。 */
export function getRuntimeSkillDefinitions(): RuntimeSkillDefinition[] {
  return getAllSkills().map((skill) => ({
    name: skill.name,
    displayName: skill.displayName,
    description: skill.description,
    contentCache: skill.contentCache,
    enabled: skill.enabled,
  }));
}
