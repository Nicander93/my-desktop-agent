// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { TraceSpan } from '@desktop-agent/shared';
import {
  applyTraceSpanToToolCalls,
  applyStreamToolResult,
  enrichToolCallsWithTraceDurations,
  finalizeToolCalls,
  isWaitingForModel,
  syncToolCallsFromTrace,
} from '../src/lib/toolCallSync';
import type { ToolCall } from '../src/stores/chatStore';

describe('applyTraceSpanToToolCalls', () => {
  it('marks pending tool completed from trace tool_result', () => {
    const toolCalls: ToolCall[] = [
      { id: 'pending-Bash', toolName: 'Bash', input: {}, status: 'running' },
    ];
    const span: TraceSpan = {
      id: 'r1',
      runId: 'run1',
      sessionId: 's1',
      type: 'tool_result',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: {
        toolUseId: 'tool-abc',
        name: 'Bash',
        output: 'ok',
        isError: false,
      },
    };

    const next = applyTraceSpanToToolCalls(toolCalls, span);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: 'tool-abc',
      toolName: 'Bash',
      status: 'completed',
    });
  });

  it('syncs tool_call span to running with real id', () => {
    const toolCalls: ToolCall[] = [
      { id: 'pending-Bash', toolName: 'Bash', input: {}, status: 'pending' },
    ];
    const span: TraceSpan = {
      id: 'c1',
      runId: 'run1',
      sessionId: 's1',
      type: 'tool_call',
      timestamp: '2026-01-01T00:00:00.000Z',
      payload: {
        toolUseId: 'tool-abc',
        name: 'Bash',
        input: { command: 'echo hi' },
      },
    };

    const next = applyTraceSpanToToolCalls(toolCalls, span);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: 'tool-abc',
      status: 'running',
      startedAt: Date.parse('2026-01-01T00:00:00.000Z'),
    });
  });

  it('writes durationMs from trace tool_result', () => {
    const toolCalls: ToolCall[] = [
      { id: 'tool-abc', toolName: 'Bash', input: {}, status: 'running' },
    ];
    const span: TraceSpan = {
      id: 'r1',
      runId: 'run1',
      sessionId: 's1',
      type: 'tool_result',
      timestamp: '2026-01-01T00:00:01.000Z',
      durationMs: 50,
      payload: {
        toolUseId: 'tool-abc',
        name: 'Bash',
        output: 'ok',
        isError: false,
      },
    };

    const next = applyTraceSpanToToolCalls(toolCalls, span);
    expect(next[0]).toMatchObject({
      status: 'completed',
      durationMs: 50,
    });
  });
});

describe('finalizeToolCalls', () => {
  it('marks running tools as completed', () => {
    const next = finalizeToolCalls([
      { id: '1', toolName: 'Bash', input: {}, status: 'running' },
      { id: '2', toolName: 'Read', input: {}, status: 'completed' },
    ]);
    expect(next?.map((t) => t.status)).toEqual(['completed', 'completed']);
  });

  it('preserves durationMs from startedAt when finalizing', () => {
    const startedAt = Date.now() - 1200;
    const next = finalizeToolCalls([
      { id: '1', toolName: 'Bash', input: {}, status: 'running', startedAt },
    ]);
    expect(next?.[0]?.durationMs).toBeGreaterThanOrEqual(1200);
  });
});

describe('isWaitingForModel', () => {
  it('returns true when streaming with all tools done', () => {
    expect(
      isWaitingForModel(
        [{ id: '1', toolName: 'Bash', input: {}, status: 'completed' }],
        true,
      ),
    ).toBe(true);
  });
});

describe('applyStreamToolResult', () => {
  it('writes durationMs from startedAt', () => {
    const startedAt = Date.now() - 800;
    const next = applyStreamToolResult(
      [{ id: 't1', toolName: 'Bash', input: {}, status: 'running', startedAt }],
      { tool_use_id: 't1', tool_name: 'Bash', output: 'ok' },
    );
    expect(next[0]).toMatchObject({ status: 'completed', durationMs: expect.any(Number) });
    expect(next[0]?.durationMs).toBeGreaterThanOrEqual(800);
  });
});

describe('enrichToolCallsWithTraceDurations', () => {
  it('fills missing durationMs from trace spans', () => {
    const spans: TraceSpan[] = [
      {
        id: 'r1',
        runId: 'run1',
        sessionId: 's1',
        type: 'tool_result',
        timestamp: '2026-01-01T00:00:01.000Z',
        durationMs: 320,
        payload: { toolUseId: 't1', name: 'Bash', output: 'ok', isError: false },
      },
    ];
    const next = enrichToolCallsWithTraceDurations(
      [{ id: 't1', toolName: 'Bash', input: {}, status: 'completed' }],
      spans,
    );
    expect(next[0]?.durationMs).toBe(320);
  });
});

describe('syncToolCallsFromTrace', () => {
  it('replays trace spans in order', () => {
    const spans: TraceSpan[] = [
      {
        id: 'c1',
        runId: 'run1',
        sessionId: 's1',
        type: 'tool_call',
        timestamp: '2026-01-01T00:00:00.000Z',
        payload: { toolUseId: 't1', name: 'Bash', input: {} },
      },
      {
        id: 'r1',
        runId: 'run1',
        sessionId: 's1',
        type: 'tool_result',
        timestamp: '2026-01-01T00:00:01.000Z',
        durationMs: 120,
        payload: { toolUseId: 't1', name: 'Bash', output: 'done', isError: false },
      },
    ];

    const next = syncToolCallsFromTrace([], spans);
    expect(next[0]?.status).toBe('completed');
    expect(next[0]?.durationMs).toBe(120);
  });
});
