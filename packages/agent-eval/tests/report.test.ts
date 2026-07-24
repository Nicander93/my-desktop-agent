import { describe, expect, it } from 'vitest';
import { renderReport, summarizeResults } from '../src/report.js';

describe('evaluation reports', () => {
  it('counts verifier outcomes without treating an agent response as success', () => {
    const results = [
      { taskId: 'task', taskVersion: '1', status: 'failed', durationMs: 10, model: { model: 'local' }, artifacts: { resultPath: 'a' }, failure: { category: 'environment' } },
      { taskId: 'task', taskVersion: '1', status: 'passed', durationMs: 20, model: { model: 'local' }, artifacts: { resultPath: 'b' } },
    ] as never[];
    expect(summarizeResults(results)).toMatchObject({ totalRuns: 2, passedRuns: 1, failedRuns: 1, medianDurationMs: 20 });
    expect(renderReport(results)).toContain('**failed**');
    expect(renderReport(results)).toContain('environment: 1');
  });
});
