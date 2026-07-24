import { describe, expect, it } from 'vitest';
import { TraceRecorder } from '../src/trace.js';

describe('raw tool trace retention', () => {
  it('does not truncate a raw tool result by default', () => {
    const recorder = new TraceRecorder('test-session', { persist: false });
    recorder.startRun({ prompt: 'test', model: 'test', cwd: '.', toolNames: ['Bash'] });
    recorder.recordToolCall(1, { toolUseId: 'call-1', name: 'Bash', input: {} });
    const raw = 'x'.repeat(20_000);
    const span = recorder.recordToolResult(1, { toolUseId: 'call-1', name: 'Bash', output: raw, isError: false }, 1);

    expect((span?.payload as { output: string }).output).toBe(raw);
  });
});
