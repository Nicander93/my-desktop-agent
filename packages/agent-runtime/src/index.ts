// Agent Runtime - 基于 @codeany/open-agent-sdk
export { AgentRuntime } from './runtime.js';
export type { RuntimeOptions, AgentSessionOptions } from './runtime.js';

// 重新导出 SDK 类型
export type { Agent, AgentOptions, SDKMessage } from '@codeany/open-agent-sdk';

// 导出共享类型
export * from '@desktop-agent/shared';