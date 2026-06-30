// Agent Runtime - 基于 @codeany/open-agent-sdk
export { AgentRuntime } from './runtime.js';
export { extractPathsFromToolInput } from './pathUtils.js';
export { buildSessionMcpServers, preinstallMcpDependencies, setupMcpServer, testMcpConnection } from './mcp.js';
export { syncRuntimeSkills, clearRuntimeSkills } from './skills.js';
export type { McpConnectionTestOptions } from './mcp.js';
export type { RuntimeOptions, AgentSessionOptions, AgentQueryOptions, PathAccessChecker, PathAccessCheckRequest } from './runtime.js';

// 重新导出 SDK 类型
export type { Agent, AgentOptions, SDKMessage } from '@codeany/open-agent-sdk';

// 导出共享类型
export * from '@desktop-agent/shared';