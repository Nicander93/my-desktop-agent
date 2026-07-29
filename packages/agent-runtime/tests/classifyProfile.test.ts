/** 模型分类 profile：枚举校验与失败回落 */
import { describe, expect, it } from 'vitest';
import { classifyRuntimeProfile } from '../src/classifyProfile.js';

describe('classifyRuntimeProfile', () => {
  it('parses valid JSON profile', async () => {
    const profile = await classifyRuntimeProfile('做个 PPT', {
      model: 'mock',
      complete: async () => '{"profile":"office-pptx"}',
    });
    expect(profile).toBe('office-pptx');
  });

  it('falls back to general on invalid output', async () => {
    const profile = await classifyRuntimeProfile('随便', {
      model: 'mock',
      complete: async () => 'not-json',
    });
    expect(profile).toBe('general');
  });

  it('falls back to general on timeout/error', async () => {
    const profile = await classifyRuntimeProfile('随便', {
      model: 'mock',
      complete: async () => {
        throw new Error('network');
      },
    });
    expect(profile).toBe('general');
  });

  it('accepts bare profile token', async () => {
    const profile = await classifyRuntimeProfile('修 bug', {
      model: 'mock',
      complete: async () => 'coding',
    });
    expect(profile).toBe('coding');
  });
});
