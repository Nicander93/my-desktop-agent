import { describe, it, expect, vi, beforeEach } from 'vitest';

const { registerSkill, unregisterSkill } = vi.hoisted(() => ({
  registerSkill: vi.fn(),
  unregisterSkill: vi.fn(),
}));

vi.mock('@codeany/open-agent-sdk', () => ({
  registerSkill,
  unregisterSkill,
}));

import { syncRuntimeSkills, clearRuntimeSkills } from '../src/skills.js';

describe('syncRuntimeSkills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRuntimeSkills();
  });

  it('registers enabled skills only', () => {
    syncRuntimeSkills([
      {
        name: 'officecli',
        description: 'Office tools',
        contentCache: '# Office\n\nRun officecli.',
        enabled: true,
      },
      {
        name: 'other',
        description: 'Other',
        contentCache: 'body',
        enabled: false,
      },
    ]);

    expect(registerSkill).toHaveBeenCalledTimes(1);
    expect(registerSkill).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'officecli' }),
    );
  });

  it('registers mentioned disabled skills for current turn', () => {
    syncRuntimeSkills(
      [
        {
          name: 'officecli',
          description: 'Office tools',
          contentCache: 'body',
          enabled: false,
        },
      ],
      ['officecli'],
    );

    expect(registerSkill).toHaveBeenCalledTimes(1);
  });

  it('unregisters skills when disabled', () => {
    syncRuntimeSkills([
      {
        name: 'officecli',
        description: 'Office tools',
        contentCache: 'body',
        enabled: true,
      },
    ]);
    syncRuntimeSkills([
      {
        name: 'officecli',
        description: 'Office tools',
        contentCache: 'body',
        enabled: false,
      },
    ]);

    expect(unregisterSkill).toHaveBeenCalledWith('officecli');
  });
});
