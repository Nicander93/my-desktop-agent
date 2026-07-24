import { describe, expect, it } from 'vitest';
import { resolveExecutionPolicy } from '../src/policies/resolver.js';
import { createToolResultTransformer } from '../src/tool-results/transformer.js';

describe('execution policy resolver', () => {
  it('deterministically combines a profile and capabilities with restrictive model limits', () => {
    const policy = resolveExecutionPolicy({
      requestedProfile: 'coding',
      capabilities: ['run-tests', 'edit-code', 'read-project'],
      model: { supportsToolCalls: true, contextWindow: 8_000, recommendedMaxTurns: 10 },
      workspacePolicy: { destructiveActions: 'confirm', allowNetwork: false },
    });
    expect(policy.tools.allowed).toEqual(['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'TodoWrite', 'Write']);
    expect(policy.execution.maxTurns).toBe(10);
    expect(policy.context.maxToolResultChars).toBe(6000);
    expect(policy.resolutionReasons).toEqual(['profile:coding', 'capability:edit-code', 'capability:read-project', 'capability:run-tests', 'model:max-turns']);
  });

  it('removes tools when the selected model cannot call tools', () => {
    expect(resolveExecutionPolicy({ requestedProfile: 'office', model: { supportsToolCalls: false } }).tools.allowed).toEqual([]);
  });

  it('summarizes model-visible output without changing the trace-owned raw result', () => {
    const raw = 'a'.repeat(90) + 'TAIL';
    const transformed = createToolResultTransformer(40, 'office')({ type: 'tool_result', tool_use_id: 'id', content: raw }, { toolName: 'Bash' });
    expect(transformed.content).toContain('[tool result summarized; raw result available in trace; profile=office]');
    expect(raw.endsWith('TAIL')).toBe(true);
  });
});
