/**
 * Skill 持久化与运行时形状；catalog 安装走 SkillCatalogEntry，自定义走 url/local。
 */
export type SkillSource = "catalog" | "url" | "local";
/**
 * 内置 Skill 目录中用于筛选和展示的稳定分类。
 */
export type SkillCatalogCategory = "office" | "dev" | "writing" | "other";

/** 设置页与 DB 中的 Skill 记录 */
export interface SkillRecord {
  id: string;
  name: string;
  displayName: string;
  description: string;
  source: SkillSource;
  catalogId: string | null;
  sourcePath: string;
  contentCache: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * 可安装的内置 Skill 目录项及其可选打包内容。
 */
export interface SkillCatalogEntry {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: SkillCatalogCategory;
  sourcePath: string;
  /** 内置内容；安装 catalog 时优先使用，避免拉远程官方 skill */
  bundledContent?: string;
}

/** 新建或导入 Skill 时的输入 */
export interface SkillInput {
  name: string;
  displayName?: string;
  description?: string;
  source?: SkillSource;
  catalogId?: string | null;
  sourcePath: string;
  contentCache: string;
  enabled?: boolean;
}

/**
 * 从 SKILL.md 解析出的 frontmatter 字段与去除头部后的正文。
 */
export interface ParsedSkillMarkdown {
  frontmatter: Record<string, string>;
  body: string;
}

/** 传给 agent-runtime syncRuntimeSkills 的精简定义 */
export interface RuntimeSkillDefinition {
  name: string;
  displayName?: string;
  description: string;
  contentCache: string;
  enabled: boolean;
}
