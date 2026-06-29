const SKILL_MENTION_REGEX = /(?:^|\s)\/([a-zA-Z][a-zA-Z0-9_-]*)/g;

export function parseSkillMentions(content: string): string[] {
  const mentions = new Set<string>();
  for (const match of content.matchAll(SKILL_MENTION_REGEX)) {
    mentions.add(match[1]);
  }
  return Array.from(mentions);
}
