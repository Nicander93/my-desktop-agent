/**
 * Agent 运行时封装
 *
 * 基于 @codeany/open-agent-sdk，支持多 session 管理。
 * 每个 session 可绑定独立 cwd 和 workspaceId，用于工作区隔离。
 */
import { createAgent, Agent, AgentOptions, SDKMessage, replayRunTrace, replaySessionTrace } from '@codeany/open-agent-sdk';
import { Message, ToolResult, buildMcpMentionPrompt, buildFileMentionPrompt, buildSkillMentionHint, type RuntimeSkillDefinition, TraceRun } from '@desktop-agent/shared';
import { extractPathsFromToolInput } from './pathUtils.js';
import { syncRuntimeSkills, clearRuntimeSkills } from './skills.js';

/** 全局 Runtime 配置，来自环境变量 */
export interface RuntimeOptions {
  apiKey?: string;
  model?: string;
  apiType?: 'anthropic-messages' | 'openai-completions';
  baseURL?: string;
  cwd?: string;
  maxTurns?: number;
  permissionMode?: 'default' | 'acceptEdits' | 'dontAsk' | 'bypassPermissions' | 'plan';
  thinking?: {
    type: 'adaptive' | 'enabled' | 'disabled';
    budgetTokens?: number;
  };
}

/** 创建单个 Agent session 时的上下文 */
export interface AgentSessionOptions {
  /** 工作区目录，作为 Agent 工具执行的 cwd */
  cwd?: string;
  /** 工作区 ID，用于路径访问检查 */
  workspaceId?: string;
  /** 已启用的 MCP Server 配置 */
  mcpServers?: Record<string, unknown>;
  /** 已安装 Skills，用于注册到 SDK */
  skills?: RuntimeSkillDefinition[];
}

/** 单轮对话的可选参数 */
export interface AgentQueryOptions {
  mcpMentions?: string[];
  fileRefs?: string[];
  skillMentions?: string[];
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
   * 若已有实例但未启用 trace，会先关闭并重建
   */
  createAgent(sessionId: string, sessionOptions?: AgentSessionOptions): Agent {
    const existing = this.agents.get(sessionId);
    if (existing && this.agentHasTrace(existing)) {
      return existing;
    }
    if (existing) {
      void existing.close();
      this.agents.delete(sessionId);
    }

    if (sessionOptions?.workspaceId) {
      this.sessionWorkspaceMap.set(sessionId, sessionOptions.workspaceId);
    }

    const canUseTool = this.buildCanUseTool(sessionId, sessionOptions?.workspaceId);

    syncRuntimeSkills(sessionOptions?.skills ?? []);

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
      resume: sessionId,
      stream: true,
      trace: { enabled: true, persist: true },
      ...(this.options.thinking ? { thinking: this.options.thinking } : {}),
      ...(sessionOptions?.mcpServers && Object.keys(sessionOptions.mcpServers).length > 0
        ? { mcpServers: sessionOptions.mcpServers as AgentOptions['mcpServers'] }
        : {}),
    };

    const agent = createAgent(agentOptions);
    this.agents.set(sessionId, agent);
    return agent;
  }

  getAgent(sessionId: string): Agent | undefined {
    return this.agents.get(sessionId);
  }

  /** 流式发送消息，确保 Agent 已启用 trace */
  async sendMessage(
    sessionId: string,
    content: string,
    sessionOptions?: AgentSessionOptions,
    queryOptions?: AgentQueryOptions,
  ): Promise<AsyncGenerator<SDKMessage>> {
    syncRuntimeSkills(
      sessionOptions?.skills ?? [],
      queryOptions?.skillMentions ?? [],
    );
    const agent = await this.ensureAgent(sessionId, sessionOptions);
    const overrides = this.buildQueryOverrides(queryOptions);
    return agent.query(content, overrides);
  }

  async prompt(
    sessionId: string,
    content: string,
    sessionOptions?: AgentSessionOptions,
    queryOptions?: AgentQueryOptions,
  ): Promise<string> {
    syncRuntimeSkills(
      sessionOptions?.skills ?? [],
      queryOptions?.skillMentions ?? [],
    );
    const agent = await this.ensureAgent(sessionId, sessionOptions);
    const overrides = this.buildQueryOverrides(queryOptions);
    const result = await agent.prompt(content, overrides);
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
    clearRuntimeSkills();
  }

  /** 从 SDK 持久化的 trace.jsonl 加载单次 run 的完整 trace */
  async getTraceRun(sessionId: string, runId: string): Promise<TraceRun | null> {
    return replayRunTrace(sessionId, runId);
  }

  /** 加载 session 最近一次 run 的 trace */
  async getLatestTraceRun(sessionId: string): Promise<TraceRun | null> {
    const runs = await replaySessionTrace(sessionId);
    return runs.length > 0 ? runs[runs.length - 1]! : null;
  }

  private agentHasTrace(agent: Agent): boolean {
    return typeof agent.getTraceRecorder === 'function' && agent.getTraceRecorder() != null;
  }

  private async ensureAgent(sessionId: string, sessionOptions?: AgentSessionOptions): Promise<Agent> {
    const existing = this.agents.get(sessionId);
    if (existing && this.agentHasTrace(existing)) {
      return existing;
    }
    if (existing) {
      await existing.close();
      this.agents.delete(sessionId);
    }
    return this.createAgent(sessionId, sessionOptions);
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

  private buildQueryOverrides(
    queryOptions?: AgentQueryOptions,
  ): Partial<AgentOptions> | undefined {
    const parts = [
      buildSkillMentionHint(queryOptions?.skillMentions ?? []),
      buildMcpMentionPrompt(queryOptions?.mcpMentions ?? []),
      buildFileMentionPrompt(queryOptions?.fileRefs ?? []),
    ].filter(Boolean);
    if (parts.length === 0) return undefined;
    return { appendSystemPrompt: parts.join('\n\n') };
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
