// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildToolActivitySummaryLabel,
  formatToolCallDuration,
  sumCompletedToolDurationMs,
} from '../src/lib/toolActivitySummary';
import type { ToolCall } from '../src/stores/chatStore';

describe('buildToolActivitySummaryLabel', () => {
  const bashTool: ToolCall = {
    id: '1',
    toolName: 'Bash',
    input: {},
    status: 'running',
  };

  it('shows live elapsed for active tool', () => {
    const label = buildToolActivitySummaryLabel([bashTool], { activeElapsedMs: 3200 });
    expect(label).toBe('ran 1 command · 3.2s…');
  });

  it('shows model wait elapsed', () => {
    const label = buildToolActivitySummaryLabel(
      [{ ...bashTool, status: 'completed', durationMs: 50 }],
      { waitingForModel: true, modelWaitElapsedMs: 25000 },
    );
    expect(label).toBe('ran 1 command · 等待模型 25.0s…');
  });

  it('shows total duration when all tools completed', () => {
    const label = buildToolActivitySummaryLabel([
      { id: '1', toolName: 'Bash', input: {}, status: 'completed', durationMs: 450 },
      { id: '2', toolName: 'Bash', input: {}, status: 'completed', durationMs: 550 },
    ]);
    expect(label).toBe('ran 2 commands · 1.0s');
  });
});

describe('formatToolCallDuration', () => {
  it('formats completed tool duration', () => {
    expect(
      formatToolCallDuration(
        { id: '1', toolName: 'Bash', input: {}, status: 'completed', durationMs: 455 },
      ),
    ).toBe('455ms');
  });

  it('formats live elapsed for running tool', () => {
    expect(
      formatToolCallDuration(
        { id: '1', toolName: 'Bash', input: {}, status: 'running' },
        1500,
      ),
    ).toBe('1.5s…');
  });
});

describe('sumCompletedToolDurationMs', () => {
  it('sums completed tool durations', () => {
    const total = sumCompletedToolDurationMs([
      { id: '1', toolName: 'Bash', input: {}, status: 'completed', durationMs: 100 },
      { id: '2', toolName: 'Read', input: {}, status: 'completed', durationMs: 200 },
      { id: '3', toolName: 'Bash', input: {}, status: 'running' },
    ]);
    expect(total).toBe(300);
  });
});
