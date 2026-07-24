// Agent Runtime - 基于 @codeany/open-agent-sdk
export { AgentRuntime } from './runtime.js';
export { inferRuntimeProfile, getRuntimeProfilePolicy, profilePolicyToAgentOptions, OFFICE_FAST_PATH_PROMPT } from './profiles.js';
export { extractPathsFromToolInput } from './pathUtils.js';
export { buildSessionMcpServers, preinstallMcpDependencies, setupMcpServer, testMcpConnection, resolveSpawnCommandName } from './mcp.js';
export { syncRuntimeSkills, clearRuntimeSkills } from './skills.js';
export { resolveExecutionPolicy } from './policies/resolver.js';
export { createToolResultTransformer } from './tool-results/transformer.js';
export type { McpConnectionTestOptions } from './mcp.js';
export type { RuntimeOptions, AgentSessionOptions, AgentQueryOptions, PathAccessChecker, PathAccessCheckRequest } from './runtime.js';
export type { RuntimeProfile, RuntimeProfilePolicy, ToolResultPolicy } from './profiles.js';
export type { RuntimeCapability } from './capabilities/types.js';
export type { ModelCapabilityDescriptor, ResolvedExecutionPolicy, RuntimeExecutionRequest, WorkspaceExecutionPolicy } from './policies/types.js';

// 重新导出 SDK 类型
export type { Agent, AgentOptions, SDKMessage } from '@codeany/open-agent-sdk';
