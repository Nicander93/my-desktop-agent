import type { EvalRunResult } from './task-schema.js';

export function renderTaskReport(result: EvalRunResult): string {
  const lines = [
    `# Eval Report: ${result.task.id}`,
    '',
    `- Status: **${result.status}**`,
    `- Outcome: **${result.outcome.percentage}%** (${result.outcome.score}/${result.outcome.maxScore})`,
    `- Model: ${result.model.presetId} (${result.model.model})`,
    `- Duration: ${formatDuration(result.durationMs)}`,
    `- Workspace: \`${result.workspacePath}\``,
    '',
    '## Metrics',
    '',
    '| Turns | Tool calls | Trace spans | Changed files | Input tokens | Output tokens |',
    '|---:|---:|---:|---:|---:|---:|',
    `| ${result.metrics.turns} | ${result.metrics.toolCalls} | ${result.metrics.spans} | ${result.metrics.changedFiles} | ${result.metrics.inputTokens ?? '-'} | ${result.metrics.outputTokens ?? '-'} |`,
    '',
    '## Checks',
    '',
    '| Check | Type | Result | Weight | Evidence |',
    '|---|---|---|---:|---|',
    ...result.checks.map((check) => `| ${check.id} | ${check.type} | ${check.passed ? 'pass' : 'fail'} | ${check.weight} | ${escapeTable(check.evidence.join('<br>'))} |`),
  ];
  if (result.failure) {
    lines.push('', '## Failure diagnosis', '', `- Phase: ${result.failure.phase}`, `- Reason: ${result.failure.reason}`);
    lines.push(...result.failure.evidence.map((evidence) => `- Evidence: ${evidence}`));
  }
  lines.push('', '## Artifacts', '', `- Result: \`result.json\``, `- Diff: \`${result.artifacts.diffPath}\``);
  if (result.artifacts.traceJsonlPath) lines.push(`- Raw trace: \`${result.artifacts.traceJsonlPath}\``);
  lines.push(`- Harness events: \`${result.artifacts.eventsJsonlPath}\``);
  return `${lines.join('\n')}\n`;
}

export function renderRunSummary(results: EvalRunResult[]): string {
  const lines = [
    '# Coding Evaluation Summary',
    '',
    '| Task | Status | Outcome | Duration | Turns | Tool calls |',
    '|---|---|---:|---:|---:|---:|',
    ...results.map((result) => `| ${result.task.id} | ${result.status} | ${result.outcome.percentage}% | ${formatDuration(result.durationMs)} | ${result.metrics.turns} | ${result.metrics.toolCalls} |`),
    '',
    `Passed: ${results.filter((result) => result.status === 'pass').length}/${results.length}`,
  ];
  return `${lines.join('\n')}\n`;
}

function formatDuration(durationMs: number): string {
  return durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`;
}

function escapeTable(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}
