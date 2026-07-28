/** AGENT_RUNTIME_PROFILES 枚举与校验 */
import { describe, expect, it } from 'vitest';
import { AGENT_RUNTIME_PROFILES, isAgentRuntimeProfile } from '../src/types/mcp.js';

describe('AgentRuntimeProfile enum', () => {
  it('includes office-pptx', () => {
    expect(AGENT_RUNTIME_PROFILES).toContain('office-pptx');
    expect(AGENT_RUNTIME_PROFILES).toContain('office');
  });

  it('validates membership', () => {
    expect(isAgentRuntimeProfile('office-pptx')).toBe(true);
    expect(isAgentRuntimeProfile('unknown')).toBe(false);
  });
});
