import { describe, expect, it } from 'vitest';
import {
  appendTraceSpan,
  buildTraceRunFromSpans,
  groupTraceByTurn,
  isTraceMessage,
  summarizeTraceRun,
} from '../src/trace/groupTrace.js';
import type { TraceSpan } from '../src/types/trace.js';

function span(partial: Partial<TraceSpan> & Pick<TraceSpan, 'type'>): TraceSpan {
  return {
    id: partial.id ?? crypto.randomUUID(),
    runId: partial.runId ?? 'run-1',
    sessionId: partial.sessionId ?? 'session-1',
    timestamp: partial.timestamp ?? new Date().toISOString(),
    ...partial,
  };
}

describe('trace grouping', () => {
  it('groups spans into turns', () => {
    const spans: TraceSpan[] = [
      span({ id: '1', type: 'turn_start', turn: 1 }),
      span({ id: '2', type: 'llm_request', turn: 1, payload: { model: 'gpt-4' } }),
      span({ id: '3', type: 'llm_response', turn: 1, durationMs: 120, payload: { content: [] } }),
      span({
        id: '4',
        type: 'tool_call',
        turn: 1,
        payload: { toolUseId: 't1', name: 'Read', input: { path: 'a.ts' } },
      }),
      span({
        id: '5',
        type: 'tool_result',
        turn: 1,
        durationMs: 50,
        payload: { toolUseId: 't1', name: 'Read', output: 'ok', isError: false },
      }),
    ];

    const turns = groupTraceByTurn(spans);
    expect(turns).toHaveLength(1);
    expect(turns[0].toolCalls).toHaveLength(1);
    expect(turns[0].toolCalls[0].result?.durationMs).toBe(50);
  });

  it('summarizes a trace run', () => {
    const spans: TraceSpan[] = [
      span({ type: 'run_start', payload: { model: 'gpt-4', cwd: '/', toolNames: [], prompt: 'hi' } }),
      span({ type: 'turn_start', turn: 1 }),
      span({
        type: 'llm_response',
        turn: 1,
        payload: { content: [], usage: { input_tokens: 100, output_tokens: 20 } },
      }),
      span({ type: 'run_end', durationMs: 500, payload: { numTurns: 1, subtype: 'success' } }),
    ];

    const run = buildTraceRunFromSpans(spans)!;
    const summary = summarizeTraceRun(run);
    expect(summary.turnCount).toBe(1);
    expect(summary.inputTokens).toBe(100);
    expect(summary.outputTokens).toBe(20);
  });

  it('appends and deduplicates spans by id', () => {
    const base = span({ id: 'x', type: 'turn_start', turn: 1 });
    const next = appendTraceSpan([base], { ...base, durationMs: 10 });
    expect(next).toHaveLength(1);
    expect(next[0].durationMs).toBe(10);
  });

  it('detects trace stream messages', () => {
    const s = span({ type: 'llm_request', turn: 1 });
    expect(isTraceMessage({ type: 'trace', span: s })).toBe(true);
    expect(isTraceMessage({ type: 'assistant' })).toBe(false);
  });
});
