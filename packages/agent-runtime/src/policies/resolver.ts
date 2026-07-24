import { CAPABILITY_REGISTRY } from '../capabilities/registry.js';
import type { RuntimeCapability } from '../capabilities/types.js';
import type { RuntimeProfile } from '../profiles.js';
import type { ResolvedExecutionPolicy, RuntimeExecutionRequest } from './types.js';

const PROFILE_DEFAULTS: Record<RuntimeProfile, { tools: string[]; maxTurns: number; maxToolResultChars: number }> = {
  general: { tools: [], maxTurns: 30, maxToolResultChars: 8000 },
  coding: { tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'TodoWrite'], maxTurns: 20, maxToolResultChars: 6000 },
  office: { tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'], maxTurns: 8, maxToolResultChars: 4000 },
  'file-organizing': { tools: ['Read', 'Glob', 'Grep'], maxTurns: 12, maxToolResultChars: 4000 },
  mcp: { tools: ['Read', 'Glob', 'Grep'], maxTurns: 16, maxToolResultChars: 6000 },
};

export function resolveExecutionPolicy(request: RuntimeExecutionRequest = {}): ResolvedExecutionPolicy {
  const profile = request.requestedProfile ?? 'general';
  const defaults = PROFILE_DEFAULTS[profile];
  const capabilities = [...new Set(request.capabilities ?? [])].sort() as RuntimeCapability[];
  const reasons = [`profile:${profile}`];
  const allowed = new Set(defaults.tools);
  let maxToolResultChars = defaults.maxToolResultChars;
  for (const capability of capabilities) {
    const fragment = CAPABILITY_REGISTRY[capability];
    for (const tool of fragment.allowedTools) allowed.add(tool);
    maxToolResultChars = Math.min(maxToolResultChars, fragment.maxToolResultChars ?? maxToolResultChars);
    reasons.push(`capability:${capability}`);
  }
  const model = request.model;
  let maxTurns = defaults.maxTurns;
  if (model?.recommendedMaxTurns) { maxTurns = Math.min(maxTurns, model.recommendedMaxTurns); reasons.push('model:max-turns'); }
  if (model && !model.supportsToolCalls) { allowed.clear(); reasons.push('model:no-tool-calls'); }
  const apply = (overrides: Partial<NonNullable<RuntimeExecutionRequest['taskOverrides']>> | undefined, source: string) => {
    if (!overrides) return;
    for (const tool of overrides.allowedTools ?? []) allowed.add(tool);
    for (const tool of overrides.disallowedTools ?? []) allowed.delete(tool);
    if (overrides.maxTurns) maxTurns = Math.min(maxTurns, overrides.maxTurns);
    if (overrides.maxToolResultChars) maxToolResultChars = Math.min(maxToolResultChars, overrides.maxToolResultChars);
    reasons.push(source);
  };
  apply(request.taskOverrides, 'task-overrides');
  apply(request.userOverrides, 'user-overrides');
  const workspace = request.workspacePolicy;
  return {
    requestedProfile: profile,
    resolvedProfile: profile,
    capabilities,
    tools: { allowed: [...allowed].sort(), disallowed: [] },
    context: { maxEstimatedTokens: model?.contextWindow ? Math.min(16_000, Math.floor(model.contextWindow * 0.6)) : 12_000, maxToolResultChars, injectProjectContext: 'once', injectGitStatus: 'on-change' },
    execution: { maxTurns, maxInvalidToolRetries: 1, maxSameToolRetries: 2, allowProfileFallback: profile === 'office' },
    risk: { allowNetwork: workspace?.allowNetwork ?? false, allowedWritePaths: [...(workspace?.allowedWritePaths ?? [])].sort(), destructiveActions: workspace?.destructiveActions ?? 'deny' },
    resolutionReasons: reasons,
  };
}
