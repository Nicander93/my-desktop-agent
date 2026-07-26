/**
 * 按 sessionId 缓存 Agent，合并 profile/capability 后再调 open-agent-sdk。
 * IPC / DB / UI 不在这。有 modelConfig 时 apiKey 传空串，避免回退到 CODEANY_API_KEY。
 */
import { createAgent, Agent, AgentOptions, SDKMessage, replayRunTrace, replaySessionTrace, type ContentBlockParam } from '@codeany/open-agent-sdk';
import { Message, ToolResult, buildMcpMentionPrompt, buildFileMentionPrompt, buildSkillMentionHint, type ModelConfig, type RuntimeSkillDefinition, TraceRun } from '@desktop-agent/shared';
import { extractPathsFromToolInput } from './pathUtils.js';
import { syncRuntimeSkills, clearRuntimeSkills } from './skills.js';
import { getRuntimeProfilePolicy, profilePolicyToAgentOptions, type RuntimeProfile } from './profiles.js';
import type { RuntimeCapability } from './capabilities/types.js';
import { resolveExecutionPolicy } from './policies/resolver.js';
import { createToolResultTransformer } from './tool-results/transformer.js';

/** 主进程环境变量带来的默认项 */
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
  promptCache?: AgentOptions['promptCache'];
  /** 隔离评测 workspace 时应为 false，避免注入宿主仓库 git/环境上下文 */
  includeEnvironmentContext?: boolean;
}

/** 单个 session：cwd、模型、MCP、skills 等 */
export interface AgentSessionOptions {
  /** 工作区目录，作为 Agent 工具执行的 cwd */
  cwd?: string;
  /** 工作区 ID，用于路径访问检查 */
  workspaceId?: string;
  /** 已启用的 MCP Server 配置 */
  mcpServers?: Record<string, unknown>;
  /** 已安装 Skills，用于注册到 SDK */
  skills?: RuntimeSkillDefinition[];
  /** 子进程环境变量（按 session/profile，不污染全局 process.env） */
  subprocessEnv?: Record<string, string>;
  /** 会话绑定的模型；未提供时回退 Runtime 环境变量配置 */
  modelConfig?: Pick<ModelConfig, 'id' | 'apiKey' | 'model' | 'baseURL'>;
}

/** 单轮覆盖：mention、profile、临时工具名单 */
export interface AgentQueryOptions {
  mcpMentions?: string[];
  fileRefs?: string[];
  skillMentions?: string[];
  profile?: RuntimeProfile;
  capabilities?: RuntimeCapability[];
  subprocessEnv?: Record<string, string>;
  allowedTools?: string[];
  disallowedTools?: string[];
}

/** 给 pathGuard 用的检查参数 */
export interface PathAccessCheckRequest {
  sessionId: string;
  workspaceId: string;
  targetPath: string;
  toolName: string;
}

export type PathAccessChecker = (request: PathAccessCheckRequest) => Promise<{ allowed: boolean }>;

/** session → Agent；模型一变就重建 */
export class AgentRuntime {
  private agents: Map<string, Agent> = new Map();
  private sessionWorkspaceMap = new Map<string, string>();
  /** 用来判断要不要因换模型重建 */
  private sessionModelConfigMap = new Map<string, string | undefined>();
  private options: RuntimeOptions;
  private pathAccessChecker?: PathAccessChecker;

  constructor(options: RuntimeOptions = {}) {
    this.options = {
      permissionMode: 'bypassPermissions',
      maxTurns: 50,
      ...options
    };
  }

  /** main 注入 pathGuard */
  setPathAccessChecker(checker: PathAccessChecker): void {
    this.pathAccessChecker = checker;
  }

  getSessionWorkspaceId(sessionId: string): string | undefined {
    return this.sessionWorkspaceMap.get(sessionId);
  }

  /** bypassPermissions 时不做路径检查 */
  shouldCheckPaths(): boolean {
    return this.options.permissionMode !== 'bypassPermissions';
  }

  /**
   * 缓存 Agent。无 trace 或 modelConfigId 变了会先关掉再建。
   * 带 modelConfig 时 apiKey 用 ''，挡住 SDK 读 CODEANY_API_KEY。
   */
  createAgent(sessionId: string, sessionOptions?: AgentSessionOptions): Agent {
    const existing = this.agents.get(sessionId);
    const modelConfigId = sessionOptions?.modelConfig?.id;
    if (existing && this.agentHasTrace(existing) && this.sessionModelConfigMap.get(sessionId) === modelConfigId) {
      return existing;
    }
    if (existing) {
      void existing.close();
      this.agents.delete(sessionId);
    }

    if (sessionOptions?.workspaceId) {
      this.sessionWorkspaceMap.set(sessionId, sessionOptions.workspaceId);
    }
    this.sessionModelConfigMap.set(sessionId, modelConfigId);

    const canUseTool = this.buildCanUseTool(sessionId, sessionOptions?.workspaceId);

    syncRuntimeSkills(sessionOptions?.skills ?? []);

    const agentOptions: AgentOptions = {
      // 有 modelConfig 时用 '' 抑制遗留 CODEANY_API_KEY 回退，避免打到错误端点
      apiKey: sessionOptions?.modelConfig ? (sessionOptions.modelConfig.apiKey ?? '') : this.options.apiKey,
      model: sessionOptions?.modelConfig?.model ?? this.options.model,
      apiType: this.options.apiType,
      baseURL: sessionOptions?.modelConfig?.baseURL ?? this.options.baseURL,
      cwd: sessionOptions?.cwd ?? this.options.cwd,
      maxTurns: this.options.maxTurns,
      permissionMode: this.options.permissionMode,
      canUseTool,
      persistSession: true,
      sessionId,
      resume: sessionId,
      stream: true,
      trace: { enabled: true, persist: true },
      promptCache: this.options.promptCache ?? { enabled: true, ttl: '5m' },
      includeEnvironmentContext: this.options.includeEnvironmentContext,
      ...(this.options.thinking ? { thinking: this.options.thinking } : {}),
      ...(sessionOptions?.mcpServers && Object.keys(sessionOptions.mcpServers).length > 0
        ? { mcpServers: sessionOptions.mcpServers as AgentOptions['mcpServers'] }
        : {}),
      ...(sessionOptions?.subprocessEnv ? { subprocessEnv: sessionOptions.subprocessEnv } : {}),
    };

    const agent = createAgent(agentOptions);
    this.agents.set(sessionId, agent);
    return agent;
  }

  getAgent(sessionId: string): Agent | undefined {
    return this.agents.get(sessionId);
  }

  async sendMessage(
    sessionId: string,
    content: string | ContentBlockParam[],
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

  /** 走路径检查后，用 prompt 间接调工具（没有独立 tool RPC） */
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

  /** SDK 消息粗转 UI Message；流式别依赖这个 */
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
    this.sessionModelConfigMap.delete(sessionId);
  }

  async closeAll(): Promise<void> {
    for (const [, agent] of this.agents) {
      await agent.close();
    }
    this.agents.clear();
    this.sessionWorkspaceMap.clear();
    this.sessionModelConfigMap.clear();
    clearRuntimeSkills();
  }

  async getTraceRun(sessionId: string, runId: string): Promise<TraceRun | null> {
    return replayRunTrace(sessionId, runId);
  }

  async getLatestTraceRun(sessionId: string): Promise<TraceRun | null> {
    const runs = await replaySessionTrace(sessionId);
    return runs.length > 0 ? runs[runs.length - 1]! : null;
  }

  private agentHasTrace(agent: Agent): boolean {
    return typeof agent.getTraceRecorder === 'function' && agent.getTraceRecorder() != null;
  }

  private async ensureAgent(sessionId: string, sessionOptions?: AgentSessionOptions): Promise<Agent> {
    const existing = this.agents.get(sessionId);
    const modelConfigId = sessionOptions?.modelConfig?.id;
    if (existing && this.agentHasTrace(existing) && this.sessionModelConfigMap.get(sessionId) === modelConfigId) {
      return existing;
    }
    if (existing) {
      await existing.close();
      this.agents.delete(sessionId);
    }
    return this.createAgent(sessionId, sessionOptions);
  }

  /** 工具调用前抽路径问 pathGuard */
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

  /**
   * 拼本轮 AgentOptions。
   * 工具名单：显式覆盖 > profile > capability 默认表。
   * office 不加 skill hint，免得和 OFFICE_FAST_PATH 打架。
   */
  private buildQueryOverrides(
    queryOptions?: AgentQueryOptions,
  ): Partial<AgentOptions> | undefined {
    const policy = getRuntimeProfilePolicy(queryOptions?.profile);
    const resolvedPolicy = resolveExecutionPolicy({ requestedProfile: queryOptions?.profile, capabilities: queryOptions?.capabilities });
    const profileOptions = profilePolicyToAgentOptions(policy);
    const skipSkillHint = policy?.profile === 'office';
    const parts = [
      policy?.appendSystemPrompt,
      skipSkillHint ? undefined : buildSkillMentionHint(queryOptions?.skillMentions ?? []),
      buildMcpMentionPrompt(queryOptions?.mcpMentions ?? []),
      buildFileMentionPrompt(queryOptions?.fileRefs ?? []),
    ].filter(Boolean);
    const subprocessEnvOverride = queryOptions?.subprocessEnv;
    const toolOverrides = queryOptions?.allowedTools || queryOptions?.disallowedTools;
    if (parts.length === 0 && Object.keys(profileOptions).length === 0 && !subprocessEnvOverride && !toolOverrides && !queryOptions?.capabilities?.length) return undefined;
    return {
      ...profileOptions,
      ...(queryOptions?.allowedTools ? { allowedTools: queryOptions.allowedTools } : policy?.allowedTools ? {} : { allowedTools: resolvedPolicy.tools.allowed }),
      ...(queryOptions?.disallowedTools ? { disallowedTools: queryOptions.disallowedTools } : {}),
      ...(parts.length > 0 ? { appendSystemPrompt: parts.join('\n\n') } : {}),
      ...(subprocessEnvOverride ? { subprocessEnv: subprocessEnvOverride } : {}),
      toolResultTransformer: createToolResultTransformer(resolvedPolicy.context.maxToolResultChars, resolvedPolicy.resolvedProfile),
      traceMetadata: {
        requestedProfile: resolvedPolicy.requestedProfile,
        resolvedProfile: resolvedPolicy.resolvedProfile,
        capabilities: resolvedPolicy.capabilities,
        policySnapshot: resolvedPolicy,
        resolutionReasons: resolvedPolicy.resolutionReasons,
      },
      maxSameToolRetries: resolvedPolicy.execution.maxSameToolRetries,
    };
  }

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
