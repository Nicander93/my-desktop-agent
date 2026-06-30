import { describe, it, expect } from 'vitest';
import {
  parseSkillMentions,
  parseSkillMarkdown,
  buildEnabledSkillsPrompt,
  buildSkillMentionPrompt,
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

describe('buildEnabledSkillsPrompt', () => {
  it('builds prompt for enabled skills', () => {
    const prompt = buildEnabledSkillsPrompt([
      { name: 'officecli', displayName: 'OfficeCLI', body: 'Run officecli create.' },
    ]);
    expect(prompt).toContain('Skills 已启用');
    expect(prompt).toContain('OfficeCLI');
    expect(prompt).toContain('Run officecli create.');
  });
});

describe('buildSkillMentionPrompt', () => {
  it('builds prompt for mentioned skills', () => {
    const prompt = buildSkillMentionPrompt([
      { name: 'officecli', body: 'Run officecli create.' },
    ]);
    expect(prompt).toContain('/officecli');
    expect(prompt).toContain('Run officecli create.');
  });
});
