import { describe, expect, it } from 'vitest';
import { getRuntimeProfilePolicy, inferRuntimeProfile, profilePolicyToAgentOptions } from '../src/profiles.js';

describe('runtime profiles', () => {
  it('should infer office profile from ppt requests', () => {
    expect(inferRuntimeProfile('帮我创建一个水资源分区 ppt')).toBe('office');
    expect(inferRuntimeProfile('写一个 React 组件')).toBe('general');
  });

  it('should map office policy to agent query options', () => {
    const policy = getRuntimeProfilePolicy('office');
    expect(policy?.appendSystemPrompt).toContain('officecli batch');
    expect(policy?.appendSystemPrompt).toContain('禁止 Bash 执行：officecli open、close、save、watch、load_skill');
    expect(policy?.appendSystemPrompt).toContain('batch 单独运行已内含 open/save');
    expect(policy?.appendSystemPrompt).toContain('Desktop Agent 版');
    expect(profilePolicyToAgentOptions(policy)).toEqual(expect.objectContaining({
      maxTurns: 8,
      thinking: { type: 'disabled' },
      allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
    }));
  });
});
