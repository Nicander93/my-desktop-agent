import type { SkillCatalogEntry } from '../types/skill.js';
import { OFFICECLI_PPTX_AGENT_SKILL } from './officecliPptxAgentSkill.js';

export const SKILL_CATALOG: SkillCatalogEntry[] = [
  {
    id: 'officecli',
    name: 'officecli',
    displayName: 'OfficeCLI',
    description: 'Desktop Agent 版 officecli：PPT/Office 用 batch 一次性落盘（禁止 open 常驻）',
    category: 'office',
    sourcePath: 'bundled:officecli-pptx-agent',
    bundledContent: OFFICECLI_PPTX_AGENT_SKILL,
  },
];

export function getSkillCatalogEntry(id: string): SkillCatalogEntry | undefined {
  return SKILL_CATALOG.find((entry) => entry.id === id);
}

export { OFFICECLI_PPTX_AGENT_SKILL } from './officecliPptxAgentSkill.js';
