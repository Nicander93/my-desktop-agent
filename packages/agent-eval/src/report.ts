import type { EvaluationResult } from '@desktop-agent/shared';

export interface EvaluationReportSummary {
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  errorRuns: number;
  timeoutRuns: number;
  medianDurationMs: number;
  byTask: Array<{ taskId: string; runs: number; passed: number }>;
  failures: Record<string, number>;
}

export function summarizeResults(results: EvaluationResult[]): EvaluationReportSummary {
  const durations = results.map((result) => result.durationMs).sort((a, b) => a - b);
  const grouped = new Map<string, EvaluationResult[]>();
  for (const result of results) grouped.set(result.taskId, [...(grouped.get(result.taskId) ?? []), result]);
  return {
    totalRuns: results.length,
    passedRuns: results.filter((result) => result.status === 'passed').length,
    failedRuns: results.filter((result) => result.status === 'failed').length,
    errorRuns: results.filter((result) => result.status === 'error').length,
    timeoutRuns: results.filter((result) => result.status === 'timeout').length,
    medianDurationMs: durations.length === 0 ? 0 : durations[Math.floor(durations.length / 2)]!,
    byTask: [...grouped.entries()].map(([taskId, taskResults]) => ({ taskId, runs: taskResults.length, passed: taskResults.filter((result) => result.status === 'passed').length })).sort((a, b) => a.taskId.localeCompare(b.taskId)),
    failures: Object.fromEntries(['agent', 'environment', 'verifier', 'timeout'].map((category) => [category, results.filter((result) => result.failure?.category === category).length])),
  };
}

export function renderReport(results: EvaluationResult[]): string {
  const summary = summarizeResults(results);
  return [
    '# Agent Eval Report', '', `- Runs: ${summary.totalRuns}`, `- Passed: ${summary.passedRuns}`, `- Failed: ${summary.failedRuns}`, `- Errors: ${summary.errorRuns}`, `- Timeouts: ${summary.timeoutRuns}`, `- Median duration: ${summary.medianDurationMs}ms`, '',
    '## Failure categories', '', ...Object.entries(summary.failures).map(([category, count]) => `- ${category}: ${count}`), '',
    '## Tasks', '', '| Task | Runs | Passed |', '| --- | ---: | ---: |', ...summary.byTask.map((task) => `| ${task.taskId} | ${task.runs} | ${task.passed} |`), '',
    '## Runs', '', ...results.map((result) => `- ${result.taskId}@${result.taskVersion} · ${result.model.model} · **${result.status}** · ${result.durationMs}ms · ${result.artifacts.resultPath}`), '',
  ].join('\n');
}
