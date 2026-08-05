/**
 * 按 sessionId 缓存 Agent，合并 profile/capability 后再调 open-agent-sdk。
 * IPC / DB / UI 不在这。有 modelConfig 时 apiKey 传空串，避免回退到 CODEANY_API_KEY。
 */
import {
  createAgent,
  Agent,
  AgentOptions,
  SDKMessage,
  replayRunTrace,
  replaySessionTrace,
  type ContentBlockParam,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
} from "@codeany/open-agent-sdk";
import {
  Message,
  ToolResult,
  buildMcpMentionPrompt,
  buildFileMentionPrompt,
  buildSkillMentionHint,
  type ModelConfig,
  type RuntimeSkillDefinition,
  TraceRun,
} from "@desktop-agent/shared";
import { extractPathsFromToolInput } from "./pathUtils.js";
import { syncRuntimeSkills, clearRuntimeSkills } from "./skills.js";
import {
  getRuntimeProfilePolicy,
  profilePolicyToAgentOptions,
  type RuntimeProfile,
} from "./profiles.js";
import type { RuntimeCapability } from "./capabilities/types.js";
import { resolveExecutionPolicy } from "./policies/resolver.js";
import { createToolResultTransformer } from "./tool-results/transformer.js";

/**
 * Runtime 创建时由 Host 注入的默认执行配置。
 *
 * 会话级 Model Config 可覆盖其中的连接项，但不能改变 Runtime 已设定的权限模式。
 */
export interface RuntimeOptions {
  apiKey?: string;
  model?: string;
  apiType?: "anthropic-messages" | "openai-completions";
  baseURL?: string;
  cwd?: string;
  maxTurns?: number;
  permissionMode?:
    | "default"
    | "acceptEdits"
    | "dontAsk"
    | "bypassPermissions"
    | "plan";
  thinking?: {
    type: "adaptive" | "enabled" | "disabled";
    budgetTokens?: number;
  };
  promptCache?: AgentOptions["promptCache"];
  /** 隔离评测 workspace 时应为 false，避免注入宿主仓库 git/环境上下文 */
  includeEnvironmentContext?: boolean;
  /** 单次 LLM 请求的瞬态重试（5xx、限流、网络抖动） */
  apiRetry?: RetryConfig;
}

/**
 * 单个会话绑定的工作区与可用扩展配置。
 *
 * `workspaceId` 与 `cwd` 共同限定路径访问边界；不能在不同会话之间复用。
 */
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
  modelConfig?: Pick<ModelConfig, "id" | "apiKey" | "model" | "baseURL">;
}

/**
 * 单轮请求对会话默认配置的临时覆盖。
 *
 * 该对象不持久化到 Session，避免一次 mention 或工具限制影响后续对话。
 */
export interface AgentQueryOptions {
  mcpMentions?: string[];
  fileRefs?: string[];
  skillMentions?: string[];
  profile?: RuntimeProfile;
  capabilities?: RuntimeCapability[];
  subprocessEnv?: Record<string, string>;
  allowedTools?: string[];
  disallowedTools?: string[];
  /** 显式回合上限；优先于 profile 默认（如 office-pptx=8） */
  maxTurns?: number;
}

/**
 * 请求 Host pathGuard 判断工具路径时使用的上下文。
 *
 * `sessionId` 与 `workspaceId` 均不可由工具输入替代，以防跨工作区绕过权限。
 */
export interface PathAccessCheckRequest {
  sessionId: string;
  workspaceId: string;
  targetPath: string;
  toolName: string;
}

/**
 * Runtime 依赖的路径权限检查接口。
 *
 * Runtime 只消费 allow/deny 结果，实际授权策略保留在 Host，维持跨层边界。
 */
export type PathAccessChecker = (
  request: PathAccessCheckRequest,
) => Promise<{ allowed: boolean }>;

/**
 * 管理会话到 SDK Agent 的缓存、生命周期及路径授权适配。
 *
 * 本层不拥有 IPC、持久化或 UI 状态；模型配置变化时必须关闭旧 Agent，避免旧凭证继续生效。
 */
export class AgentRuntime {
  private agents: Map<string, Agent> = new Map();
  private sessionWorkspaceMap = new Map<string, string>();
  /** 用来判断要不要因换模型重建 */
  private sessionModelConfigMap = new Map<string, string | undefined>();
  private options: RuntimeOptions;
  private pathAccessChecker?: PathAccessChecker;

  /**
   * 保存不可由单轮请求改变的 Runtime 默认项。
   *
   * 调用方必须显式选择权限模式；默认值仅为独立 SDK 使用保留的兼容行为。
   */
  constructor(options: RuntimeOptions = {}) {
    this.options = {
      permissionMode: "bypassPermissions",
      maxTurns: 50,
      ...options,
    };
  }

  /**
   * 注入由 Host 持有的 pathGuard 适配器。
   *
   * 仅在非 `bypassPermissions` 模式下调用，避免 Runtime 自行实现或复制工作区授权规则。
   */
  setPathAccessChecker(checker: PathAccessChecker): void {
    this.pathAccessChecker = checker;
  }

  /**
   * 返回当前缓存会话绑定的工作区标识。
   *
   * 会话关闭后映射会同步删除，调用方不能把 undefined 当作全局访问权限。
   */
  getSessionWorkspaceId(sessionId: string): string | undefined {
    return this.sessionWorkspaceMap.get(sessionId);
  }

  /**
   * 判断当前 Runtime 是否需要在工具调用前询问 pathGuard。
   *
   * `bypassPermissions` 是唯一跳过检查的模式，其他模式即使检查器暂未注入也不能改变策略语义。
   */
  shouldCheckPaths(): boolean {
    return this.options.permissionMode !== "bypassPermissions";
  }

  /**
   * 缓存 Agent。无 trace 或 modelConfigId 变了会先关掉再建。
   * 带 modelConfig 时 apiKey 用 ''，挡住 SDK 读 CODEANY_API_KEY。
   */
  createAgent(sessionId: string, sessionOptions?: AgentSessionOptions): Agent {
    const existing = this.agents.get(sessionId);
    const modelConfigId = sessionOptions?.modelConfig?.id;
    if (
      existing &&
      this.agentHasTrace(existing) &&
      this.sessionModelConfigMap.get(sessionId) === modelConfigId
    ) {
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

    const canUseTool = this.buildCanUseTool(
      sessionId,
      sessionOptions?.workspaceId,
    );

    syncRuntimeSkills(sessionOptions?.skills ?? []);

    const agentOptions: AgentOptions = {
      // 有 modelConfig 时用 '' 抑制遗留 CODEANY_API_KEY 回退，避免打到错误端点
      apiKey: sessionOptions?.modelConfig
        ? (sessionOptions.modelConfig.apiKey ?? "")
        : this.options.apiKey,
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
      promptCache: this.options.promptCache ?? { enabled: true, ttl: "5m" },
      includeEnvironmentContext: this.options.includeEnvironmentContext,
      ...(this.options.thinking ? { thinking: this.options.thinking } : {}),
      apiRetry: this.options.apiRetry ?? DEFAULT_RETRY_CONFIG,
      ...(sessionOptions?.mcpServers &&
      Object.keys(sessionOptions.mcpServers).length > 0
        ? {
            mcpServers: sessionOptions.mcpServers as AgentOptions["mcpServers"],
          }
        : {}),
      ...(sessionOptions?.subprocessEnv
        ? { subprocessEnv: sessionOptions.subprocessEnv }
        : {}),
    };

    const agent = createAgent(agentOptions);
    this.agents.set(sessionId, agent);
    return agent;
  }

  /**
   * 返回已创建的会话 Agent，不会因查询缺失会话而创建新实例。
   */
  getAgent(sessionId: string): Agent | undefined {
    return this.agents.get(sessionId);
  }

  /**
   * 向会话 Agent 发送一条消息并返回 SDK 流。
   *
   * Skill 注册在创建或复用 Agent 前同步，确保本轮 mention 与系统提示可解析；流的消费和错误呈现由调用方负责。
   */
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

  /**
   * 向会话 Agent 发送消息并等待聚合后的文本结果。
   *
   * 适用于内部一次性调用；需要渲染 token 或工具进度的调用方必须使用 `sendMessage`。
   */
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

  /**
   * 先完成路径授权，再通过 Agent prompt 间接执行一个内置工具。
   *
   * 当前没有独立 tool RPC；失败会转换为 ToolResult，避免把普通工具错误升级为 IPC 异常。
   */
  async executeTool(
    sessionId: string,
    toolName: string,
    input: unknown,
  ): Promise<ToolResult> {
    const check = await this.checkToolPathAccess(sessionId, toolName, input);
    if (!check.allowed) {
      return { success: false, error: check.error || "路径访问被拒绝" };
    }

    const agent = this.agents.get(sessionId);
    if (!agent) {
      return { success: false, error: "Agent not found" };
    }

    try {
      const result = await agent.prompt(
        `Use tool ${toolName} with input: ${JSON.stringify(input)}`,
      );
      return { success: true, data: result.text };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * 将 SDK 历史消息转换为兼容旧 UI 的简化 Message 列表。
   *
   * 它不保留流式增量与工具细节，实时 UI 必须订阅 stream 事件而非依赖此转换。
   */
  getMessages(sessionId: string): Message[] {
    const agent = this.agents.get(sessionId);
    if (!agent) return [];

    const messages = agent.getMessages();
    return messages.map((msg, index) => {
      if (msg.type === "user" && msg.message) {
        return {
          id: `msg-${sessionId}-${index}`,
          role: "user" as const,
          content:
            typeof msg.message.content === "string"
              ? msg.message.content
              : JSON.stringify(msg.message.content),
          timestamp: Date.now(),
        };
      }
      if (msg.type === "assistant" && msg.message) {
        const content = msg.message.content;
        const textContent = Array.isArray(content)
          ? content
              .filter((b: any) => "text" in b)
              .map((b: any) => b.text)
              .join("")
          : content;
        return {
          id: `msg-${sessionId}-${index}`,
          role: "assistant" as const,
          content: textContent,
          timestamp: Date.now(),
        };
      }
      return {
        id: `msg-${sessionId}-${index}`,
        role: "assistant" as const,
        content: "",
        timestamp: Date.now(),
      };
    });
  }

  /**
   * 释放一个会话的 Agent 及其 Runtime 侧缓存。
   *
   * 必须同时删除工作区与模型映射，避免已关闭会话的授权或配置被后续复用。
   */
  async close(sessionId: string): Promise<void> {
    const agent = this.agents.get(sessionId);
    if (agent) {
      await agent.close();
      this.agents.delete(sessionId);
    }
    this.sessionWorkspaceMap.delete(sessionId);
    this.sessionModelConfigMap.delete(sessionId);
  }

  /**
   * 释放 Runtime 管理的全部 Agent 和共享 Skill 注册状态。
   *
   * 用于主进程退出；调用顺序必须先关闭 Agent，防止仍在运行的 SDK 读取已清空的注册表。
   */
  async closeAll(): Promise<void> {
    for (const [, agent] of this.agents) {
      await agent.close();
    }
    this.agents.clear();
    this.sessionWorkspaceMap.clear();
    this.sessionModelConfigMap.clear();
    clearRuntimeSkills();
  }

  /**
   * 回放指定会话的一次持久化 trace。
   *
   * trace 不在 Runtime 内存 Map 中保存，因此即使 Agent 已关闭也可读取历史执行记录。
   */
  async getTraceRun(
    sessionId: string,
    runId: string,
  ): Promise<TraceRun | null> {
    return replayRunTrace(sessionId, runId);
  }

  /**
   * 返回会话最后一次已持久化的 trace。
   *
   * 空会话返回 null，调用方应与“trace 尚未落盘”区分处理。
   */
  async getLatestTraceRun(sessionId: string): Promise<TraceRun | null> {
    const runs = await replaySessionTrace(sessionId);
    return runs.length > 0 ? runs[runs.length - 1]! : null;
  }

  /**
   * 判断缓存 Agent 是否具备可继续使用的 trace recorder。
   *
   * 缺失 recorder 的实例不能复用，否则运行记录会丢失且 UI 无法回放。
   */
  private agentHasTrace(agent: Agent): boolean {
    return (
      typeof agent.getTraceRecorder === "function" &&
      agent.getTraceRecorder() != null
    );
  }

  /**
   * 复用与本轮模型配置一致的 Agent，或关闭旧实例后重建。
   *
   * 与同步 `createAgent` 保持相同的重建条件，但在关闭资源时等待完成，避免并发请求使用旧连接。
   */
  private async ensureAgent(
    sessionId: string,
    sessionOptions?: AgentSessionOptions,
  ): Promise<Agent> {
    const existing = this.agents.get(sessionId);
    const modelConfigId = sessionOptions?.modelConfig?.id;
    if (
      existing &&
      this.agentHasTrace(existing) &&
      this.sessionModelConfigMap.get(sessionId) === modelConfigId
    ) {
      return existing;
    }
    if (existing) {
      await existing.close();
      this.agents.delete(sessionId);
    }
    return this.createAgent(sessionId, sessionOptions);
  }

  /**
   * 构造 SDK `canUseTool` 回调，将工具输入中的所有候选路径交给 pathGuard。
   *
   * 任一路径被拒绝即拒绝整次工具调用，不能只放行部分路径后继续执行。
   */
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
          toolName: tool.name,
        });
        if (!result.allowed) {
          return {
            behavior: "deny" as const,
            message: `路径访问被拒绝: ${targetPath}`,
          };
        }
      }
      return { behavior: "allow" as const };
    };
  }

  /**
   * 拼本轮 AgentOptions。
   * 工具名单：显式覆盖 > profile > capability 默认表。
   * office-pptx 不加 skill hint，免得和 OFFICE_FAST_PATH 打架。
   */
  private buildQueryOverrides(
    queryOptions?: AgentQueryOptions,
  ): Partial<AgentOptions> | undefined {
    const policy = getRuntimeProfilePolicy(queryOptions?.profile);
    const resolvedPolicy = resolveExecutionPolicy({
      requestedProfile: queryOptions?.profile,
      capabilities: queryOptions?.capabilities,
    });
    const profileOptions = profilePolicyToAgentOptions(policy);
    const { maxTurns: _profileMaxTurns, ...profileOptionsRest } =
      profileOptions;
    // query / 任务显式 maxTurns > profile 默认 > Runtime 构造参数
    const maxTurns =
      queryOptions?.maxTurns ?? policy?.maxTurns ?? this.options.maxTurns;
    const skipSkillHint = policy?.profile === "office-pptx";
    const parts = [
      policy?.appendSystemPrompt,
      skipSkillHint
        ? undefined
        : buildSkillMentionHint(queryOptions?.skillMentions ?? []),
      buildMcpMentionPrompt(queryOptions?.mcpMentions ?? []),
      buildFileMentionPrompt(queryOptions?.fileRefs ?? []),
    ].filter(Boolean);
    const subprocessEnvOverride = queryOptions?.subprocessEnv;
    const toolOverrides =
      queryOptions?.allowedTools || queryOptions?.disallowedTools;
    if (
      parts.length === 0 &&
      Object.keys(profileOptionsRest).length === 0 &&
      !subprocessEnvOverride &&
      !toolOverrides &&
      !queryOptions?.capabilities?.length &&
      queryOptions?.maxTurns == null &&
      !policy?.maxTurns
    )
      return undefined;
    return {
      ...profileOptionsRest,
      maxTurns,
      ...(queryOptions?.allowedTools
        ? { allowedTools: queryOptions.allowedTools }
        : policy?.allowedTools
          ? {}
          : { allowedTools: resolvedPolicy.tools.allowed }),
      ...(queryOptions?.disallowedTools
        ? { disallowedTools: queryOptions.disallowedTools }
        : {}),
      ...(parts.length > 0 ? { appendSystemPrompt: parts.join("\n\n") } : {}),
      ...(subprocessEnvOverride
        ? { subprocessEnv: subprocessEnvOverride }
        : {}),
      toolResultTransformer: createToolResultTransformer(
        resolvedPolicy.context.maxToolResultChars,
        resolvedPolicy.resolvedProfile,
      ),
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

  /**
   * 为间接 tool RPC 执行同样的路径检查。
   *
   * 没有会话工作区时保留历史兼容行为放行；正式会话必须依赖 `sessionWorkspaceMap` 的绑定结果。
   */
  private async checkToolPathAccess(
    sessionId: string,
    toolName: string,
    input: unknown,
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
        toolName,
      });
      if (!result.allowed) {
        return { allowed: false, error: `路径访问被拒绝: ${targetPath}` };
      }
    }
    return { allowed: true };
  }
}

export type { Agent, AgentOptions } from "@codeany/open-agent-sdk";
export type { SDKMessage } from "@codeany/open-agent-sdk";
