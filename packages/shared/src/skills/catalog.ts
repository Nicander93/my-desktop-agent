/**
 * 内置 Skill 目录；bundledContent 安装时直接写入，避免拉远程官方包。
 * 新增条目要同步 skill 设置页与 syncRuntimeSkills。
 */
import type { SkillCatalogEntry } from '../types/skill.js';
import { OFFICECLI_PPTX_AGENT_SKILL } from './officecliPptxAgentSkill.js';

export const SKILL_CATALOG: SkillCatalogEntry[] = [
  {
    id: 'officecli',
    name: 'officecli',
    displayName: 'OfficeCLI',
    description: 'Desktop Agent 版 officecli：PPT/Excel 用 batch 一次性落盘（禁止 open 常驻）',
    category: 'office',
    sourcePath: 'bundled:officecli-pptx-agent',
    bundledContent: OFFICECLI_PPTX_AGENT_SKILL,
  },
];

/** 按 catalog id 查条目 */
export function getSkillCatalogEntry(id: string): SkillCatalogEntry | undefined {
  return SKILL_CATALOG.find((entry) => entry.id === id);
}

export { OFFICECLI_PPTX_AGENT_SKILL } from './officecliPptxAgentSkill.js';
