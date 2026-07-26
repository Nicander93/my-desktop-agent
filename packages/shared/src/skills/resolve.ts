/**
 * Skill markdown 解析与 prompt 拼装；frontmatter 只支持简单 key: value。
 * 完整 Skill 注册在 agent-runtime/skills.ts。
 */
import type { ParsedSkillMarkdown } from '../types/skill.js';

/** 无 --- 包裹时整段当 body，frontmatter 为空 */
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

/** 只取 markdown body，忽略 frontmatter */
export function getSkillPromptBody(contentCache: string): string {
  return parseSkillMarkdown(contentCache).body;
}

/** 拼进 prompt 的 Skill 块：name + 正文 */
export interface SkillPromptSection {
  name: string;
  displayName?: string;
  body: string;
}

/** 短提示：引导走 Skill 工具按需加载，不内联全文 */
export function buildSkillMentionHint(names: string[]): string {
  if (names.length === 0) return '';

  return [
    '用户在本轮消息中通过 / 指定了以下 Skill，请优先使用 Skill 工具调用（按需加载完整指引，不要猜测）：',
    ...names.map((name) => `- ${name}`),
  ].join('\n');
}

/** 已启用 Skill 的全文注入 system prompt */
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

/** / 提及时内联对应 Skill 全文 */
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
