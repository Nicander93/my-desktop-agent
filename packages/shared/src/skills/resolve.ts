import type { ParsedSkillMarkdown } from '../types/skill.js';

export function parseSkillMarkdown(raw: string): ParsedSkillMarkdown {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: raw.trim() };
  }

  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex <= 0) continue;
    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    frontmatter[key] = value;
  }

  return { frontmatter, body: match[2].trim() };
}

export function getSkillPromptBody(contentCache: string): string {
  return parseSkillMarkdown(contentCache).body;
}

export interface SkillPromptSection {
  name: string;
  displayName?: string;
  body: string;
}

export function buildEnabledSkillsPrompt(sections: SkillPromptSection[]): string {
  if (sections.length === 0) return '';

  const blocks = sections.map((section) => {
    const title = section.displayName || section.name;
    return `## Skill: ${title}\n\n${section.body}`;
  });

  return [
    '以下 Skills 已启用，处理相关任务时请遵循其中的指引：',
    '',
    ...blocks,
  ].join('\n');
}

export function buildSkillMentionPrompt(sections: SkillPromptSection[]): string {
  if (sections.length === 0) return '';

  const blocks = sections.map((section) => {
    const title = section.displayName || section.name;
    return `## Skill: ${title} (/${section.name})\n\n${section.body}`;
  });

  return [
    '用户在本轮消息中通过 / 指定了以下 Skill，请优先遵循其中的指引：',
    '',
    ...blocks,
  ].join('\n');
}
