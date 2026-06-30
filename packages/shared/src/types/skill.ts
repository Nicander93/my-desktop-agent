export type SkillSource = 'catalog' | 'url' | 'local';
export type SkillCatalogCategory = 'office' | 'dev' | 'writing' | 'other';

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
}

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
<<<<<<< HEAD

export interface RuntimeSkillDefinition {
  name: string;
  displayName?: string;
  description: string;
  contentCache: string;
  enabled: boolean;
}
=======
>>>>>>> e2ca66262520acbed1d525d6937a13d2d943b570
