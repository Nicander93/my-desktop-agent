/**
 * Agent 运行时封装
 *
 * 基于 @codeany/open-agent-sdk，支持多 session 管理。
 * 每个 session 可绑定独立 cwd 和 workspaceId，用于工作区隔离。
 */
import { createAgent, Agent, AgentOptions, SDKMessage } from '@codeany/open-agent-sdk';
import { Message, ToolResult } from '@desktop-agent/shared';
import { extractPathsFromToolInput } from './pathUtils.js';

/** 全局 Runtime 配置，来自环境变量 */
export interface RuntimeOptions {
  apiKey?: string;
  model?: string;
  apiType?: 'anthropic-messages' | 'openai-completions';
  baseURL?: string;
  cwd?: string;
  maxTurns?: number;
  permissionMode?: 'default' | 'acceptEdits' | 'dontAsk' | 'bypassPermissions' | 'plan';
}

/** 创建单个 Agent session 时的上下文 */
export interface AgentSessionOptions {
  /** 工作区目录，作为 Agent 工具执行的 cwd */
  cwd?: string;
  /** 工作区 ID，用于路径访问检查 */
  workspaceId?: string;
}

/** 路径访问检查请求，由主进程 pathGuard 处理 */
export interface PathAccessCheckRequest {
  sessionId: string;
  workspaceId: string;
  targetPath: string;
  toolName: string;
}

export type PathAccessChecker = (request: PathAccessCheckRequest) => Promise<{ allowed: boolean }>;

export class AgentRuntime {
  /** sessionId → Agent 实例 */
  private agents: Map<string, Agent> = new Map();
  /** sessionId → workspaceId，用于路径检查 */
  private sessionWorkspaceMap = new Map<string, string>();
  private options: RuntimeOptions;
  private pathAccessChecker?: PathAccessChecker;

  constructor(options: RuntimeOptions = {}) {
    this.options = {
      permissionMode: 'bypassPermissions',
      maxTurns: 10,
      ...options
    };
  }

  /** 注入路径检查器，由 agentPathInterceptor 在 main 进程调用 */
  setPathAccessChecker(checker: PathAccessChecker): void {
    this.pathAccessChecker = checker;
  }

  getSessionWorkspaceId(sessionId: string): string | undefined {
    return this.sessionWorkspaceMap.get(sessionId);
  }

  /** permissionMode 非 bypassPermissions 时启用路径检查 */
  shouldCheckPaths(): boolean {
    return this.options.permissionMode !== 'bypassPermissions';
  }

  /**
   * 创建 Agent 实例并缓存
   * 若启用路径检查，会通过 SDK canUseTool 拦截工具调用
   */
  createAgent(sessionId: string, sessionOptions?: AgentSessionOptions): Agent {
    if (sessionOptions?.workspaceId) {
      this.sessionWorkspaceMap.set(sessionId, sessionOptions.workspaceId);
    }

    const canUseTool = this.buildCanUseTool(sessionId, sessionOptions?.workspaceId);

    const agentOptions: AgentOptions = {
      apiKey: this.options.apiKey,
      model: this.options.model,
      apiType: this.options.apiType,
      baseURL: this.options.baseURL,
      cwd: sessionOptions?.cwd ?? this.options.cwd,
      maxTurns: this.options.maxTurns,
      permissionMode: this.options.permissionMode,
      canUseTool,
      persistSession: true,
      sessionId,
      stream: true
    };

    const agent = createAgent(agentOptions);
    this.agents.set(sessionId, agent);
    return agent;
  }

  getAgent(sessionId: string): Agent | undefined {
    return this.agents.get(sessionId);
  }

  /** 流式发送消息，首次调用时懒创建 Agent */
  async sendMessage(sessionId: string, content: string, sessionOptions?: AgentSessionOptions): Promise<AsyncGenerator<SDKMessage>> {
    let agent = this.agents.get(sessionId);
    if (!agent) {
      agent = this.createAgent(sessionId, sessionOptions);
    }

    return agent.query(content);
  }

  async prompt(sessionId: string, content: string, sessionOptions?: AgentSessionOptions): Promise<string> {
    let agent = this.agents.get(sessionId);
    if (!agent) {
      agent = this.createAgent(sessionId, sessionOptions);
    }

    const result = await agent.prompt(content);
    return result.text;
  }

  /** 手动执行工具，执行前同样走路径检查 */
  async executeTool(sessionId: string, toolName: string, input: unknown): Promise<ToolResult> {
    const check = await this.checkToolPathAccess(sessionId, toolName, input);
    if (!check.allowed) {
      return { success: false, error: check.error || '路径访问被拒绝' };
    }

    const agent = this.agents.get(sessionId);
    if (!agent) {
      return { success: false, error: 'Agent not found' };
    }

    try {
      const result = await agent.prompt(`Use tool ${toolName} with input: ${JSON.stringify(input)}`);
      return { success: true, data: result.text };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /** 将 SDK 内部消息格式转换为前端 Message 格式 */
  getMessages(sessionId: string): Message[] {
    const agent = this.agents.get(sessionId);
    if (!agent) return [];

    const messages = agent.getMessages();
    return messages.map((msg, index) => {
      if (msg.type === 'user' && msg.message) {
        return {
          id: `msg-${sessionId}-${index}`,
          role: 'user' as const,
          content: typeof msg.message.content === 'string'
            ? msg.message.content
            : JSON.stringify(msg.message.content),
          timestamp: Date.now()
        };
      }
      if (msg.type === 'assistant' && msg.message) {
        const content = msg.message.content;
        const textContent = Array.isArray(content)
          ? content.filter((b: any) => 'text' in b).map((b: any) => b.text).join('')
          : content;
        return {
          id: `msg-${sessionId}-${index}`,
          role: 'assistant' as const,
          content: textContent,
          timestamp: Date.now()
        };
      }
      return {
        id: `msg-${sessionId}-${index}`,
        role: 'assistant' as const,
        content: '',
        timestamp: Date.now()
      };
    });
  }

  async close(sessionId: string): Promise<void> {
    const agent = this.agents.get(sessionId);
    if (agent) {
      await agent.close();
      this.agents.delete(sessionId);
    }
    this.sessionWorkspaceMap.delete(sessionId);
  }

  async closeAll(): Promise<void> {
    for (const [, agent] of this.agents) {
      await agent.close();
    }
    this.agents.clear();
    this.sessionWorkspaceMap.clear();
  }

  /** 构建 SDK canUseTool 回调，在每次工具调用前检查路径 */
  private buildCanUseTool(sessionId: string, workspaceId?: string) {
    if (!this.shouldCheckPaths() || !workspaceId || !this.pathAccessChecker) {
      return undefined;
    }

    const checker = this.pathAccessChecker;
    return async (tool: { name: string }, input: unknown) => {
      for (const targetPath of extractPathsFromToolInput(tool.name, input)) {
        const result = await checker({
          sessionId,
          workspaceId,
          targetPath,
          toolName: tool.name
        });
        if (!result.allowed) {
          return { behavior: 'deny' as const, message: `路径访问被拒绝: ${targetPath}` };
        }
      }
      return { behavior: 'allow' as const };
    };
  }

  /** executeTool 使用的路径检查，逻辑与 canUseTool 一致 */
  private async checkToolPathAccess(
    sessionId: string,
    toolName: string,
    input: unknown
  ): Promise<{ allowed: boolean; error?: string }> {
    if (!this.shouldCheckPaths() || !this.pathAccessChecker) {
      return { allowed: true };
    }

    const workspaceId = this.sessionWorkspaceMap.get(sessionId);
    if (!workspaceId) return { allowed: true };

    for (const targetPath of extractPathsFromToolInput(toolName, input)) {
      const result = await this.pathAccessChecker({
        sessionId,
        workspaceId,
        targetPath,
        toolName
      });
      if (!result.allowed) {
        return { allowed: false, error: `路径访问被拒绝: ${targetPath}` };
      }
    }
    return { allowed: true };
  }
}

export type { Agent, AgentOptions } from '@codeany/open-agent-sdk';
export type { SDKMessage } from '@codeany/open-agent-sdk';
