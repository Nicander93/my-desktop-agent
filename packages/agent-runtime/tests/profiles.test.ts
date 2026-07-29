/** runtime profile 策略与显式解析 */
import { describe, expect, it } from 'vitest';
import { getRuntimeProfilePolicy, profilePolicyToAgentOptions, resolveExplicitProfile } from '../src/profiles.js';

describe('runtime profiles', () => {
  it('resolves explicit profile or general', () => {
    expect(resolveExplicitProfile('coding')).toBe('coding');
    expect(resolveExplicitProfile(undefined)).toBe('general');
  });

  it('maps office-pptx policy to agent query options with fast path', () => {
    const policy = getRuntimeProfilePolicy('office-pptx');
    expect(policy?.appendSystemPrompt).toContain('officecli batch');
    expect(policy?.appendSystemPrompt).toContain('禁止 python-pptx');
    expect(policy?.appendSystemPrompt).toContain('officecli create');
    expect(policy?.appendSystemPrompt).toContain('batch 不会自动建文件');
    expect(policy?.appendSystemPrompt).toContain('相对路径');
    expect(policy?.maxTurns).toBe(50);
    expect(profilePolicyToAgentOptions(policy)).toEqual(expect.objectContaining({
      maxTurns: 50,
      thinking: { type: 'disabled' },
      allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
    }));
  });

  it('keeps office policy without pptx fast path', () => {
    const policy = getRuntimeProfilePolicy('office');
    expect(policy?.maxTurns).toBe(24);
    expect(policy?.appendSystemPrompt).toBeUndefined();
  });
});
