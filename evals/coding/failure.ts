import type { CheckResult, EvalFailure, EvalRunStatus, TraceMetrics } from './task-schema.js';

export function classifyFailure(input: {
  status: EvalRunStatus;
  agentError?: string;
  checks: CheckResult[];
  metrics: TraceMetrics;
}): EvalFailure | undefined {
  if (input.status === 'pass') return undefined;
  if (input.status === 'timeout') {
    return { phase: 'timeout', reason: 'The agent did not finish before the task timeout.', evidence: ['agent timeout'] };
  }
  if (input.status === 'error') {
    return { phase: 'agent', reason: input.agentError ?? 'The agent run failed.', evidence: [input.agentError ?? 'unknown agent error'] };
  }
  const failed = input.checks.filter((check) => !check.passed);
  const command = failed.find((check) => check.type === 'command');
  if (command) {
    return { phase: 'validation', reason: `Validation check "${command.id}" failed.`, evidence: command.evidence };
  }
  if (input.metrics.spans === 0) {
    return { phase: 'trace', reason: 'No trace spans were captured for this run.', evidence: ['trace span count=0'] };
  }
  return {
    phase: 'check',
    reason: `${failed.length} deterministic outcome check(s) failed.`,
    evidence: failed.flatMap((check) => [`${check.id}: ${check.evidence.join('; ')}`]),
  };
}
