import type { SkillCatalogEntry } from '../types/skill.js';

export const SKILL_CATALOG: SkillCatalogEntry[] = [
  {
    id: 'officecli',
    name: 'officecli',
    displayName: 'OfficeCLI',
    description: 'AI 原生 Office 套件：Word / Excel / PPT 创建与编辑',
    category: 'office',
    sourcePath: 'https://officecli.ai/SKILL.md',
  },
];

export function getSkillCatalogEntry(id: string): SkillCatalogEntry | undefined {
  return SKILL_CATALOG.find((entry) => entry.id === id);
}
