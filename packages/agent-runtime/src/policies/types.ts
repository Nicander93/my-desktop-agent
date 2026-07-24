import type { RuntimeCapability } from '../capabilities/types.js';
import type { RuntimeProfile } from '../profiles.js';

export interface ModelCapabilityDescriptor {
  supportsToolCalls: boolean;
  contextWindow?: number;
  recommendedMaxTurns?: number;
}

export interface WorkspaceExecutionPolicy {
  allowNetwork?: boolean;
  allowedWritePaths?: string[];
  destructiveActions?: 'deny' | 'confirm' | 'allow';
}

export interface ExecutionPolicyOverrides {
  maxTurns?: number;
  maxToolResultChars?: number;
  allowedTools?: string[];
  disallowedTools?: string[];
}

export interface RuntimeExecutionRequest {
  requestedProfile?: RuntimeProfile;
  capabilities?: RuntimeCapability[];
  model?: ModelCapabilityDescriptor;
  workspacePolicy?: WorkspaceExecutionPolicy;
  taskOverrides?: Partial<ExecutionPolicyOverrides>;
  userOverrides?: Partial<ExecutionPolicyOverrides>;
}

export interface ResolvedExecutionPolicy {
  requestedProfile: RuntimeProfile;
  resolvedProfile: RuntimeProfile;
  capabilities: RuntimeCapability[];
  tools: { allowed: string[]; disallowed: string[] };
  context: { maxEstimatedTokens: number; maxToolResultChars: number; injectProjectContext: 'once' | 'each-run'; injectGitStatus: 'never' | 'on-change' | 'each-run' };
  execution: { maxTurns: number; maxInvalidToolRetries: number; maxSameToolRetries: number; allowProfileFallback: boolean };
  risk: { allowNetwork: boolean; allowedWritePaths: string[]; destructiveActions: 'deny' | 'confirm' | 'allow' };
  resolutionReasons: string[];
}
