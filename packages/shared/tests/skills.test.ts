import { describe, it, expect } from 'vitest';
import {
  parseSkillMentions,
  parseSkillMarkdown,
<<<<<<< HEAD
  buildSkillMentionHint,
=======
  buildEnabledSkillsPrompt,
  buildSkillMentionPrompt,
>>>>>>> e2ca66262520acbed1d525d6937a13d2d943b570
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

<<<<<<< HEAD
describe('buildSkillMentionHint', () => {
  it('builds short hint for Skill tool', () => {
    const hint = buildSkillMentionHint(['officecli']);
    expect(hint).toContain('Skill 工具');
    expect(hint).toContain('officecli');
    expect(hint).not.toContain('officecli create');
=======
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
>>>>>>> e2ca66262520acbed1d525d6937a13d2d943b570
  });
});
