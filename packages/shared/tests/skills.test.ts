import { describe, it, expect } from 'vitest';
import {
  parseSkillMentions,
  parseSkillMarkdown,
  buildSkillMentionHint,
  getSkillCatalogEntry,
} from '../src/index.js';

describe('parseSkillMentions', () => {
  it('extracts unique mentions', () => {
    expect(parseSkillMentions('请用 /officecli 做 PPT，再 /officecli 检查')).toEqual(['officecli']);
  });
});

describe('parseSkillMarkdown', () => {
  it('parses frontmatter and body', () => {
    const raw = `---
name: officecli
description: Office tools
---

# OfficeCLI

Use shell commands.`;
    const parsed = parseSkillMarkdown(raw);
    expect(parsed.frontmatter.name).toBe('officecli');
    expect(parsed.body).toContain('# OfficeCLI');
  });
});

describe('buildSkillMentionHint', () => {
  it('builds short hint for Skill tool', () => {
    const hint = buildSkillMentionHint(['officecli']);
    expect(hint).toContain('Skill 工具');
    expect(hint).toContain('officecli');
    expect(hint).not.toContain('officecli create');
  });
});

describe('SKILL_CATALOG', () => {
  it('bundles agent officecli skill without remote open workflow', () => {
    const entry = getSkillCatalogEntry('officecli');
    expect(entry?.bundledContent).toContain('禁止');
    expect(entry?.bundledContent).toContain('officecli open');
    expect(entry?.bundledContent).not.toContain('officecli open "$FILE"');
  });
});
