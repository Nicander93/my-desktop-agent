/**
 * Skill 持久化与运行时形状；catalog 安装走 SkillCatalogEntry，自定义走 url/local。
 */
export type SkillSource = 'catalog' | 'url' | 'local';
export type SkillCatalogCategory = 'office' | 'dev' | 'writing' | 'other';

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
