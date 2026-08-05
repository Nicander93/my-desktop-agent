/**
 * Agent 主循环：拼上下文 → 调 Provider → 跑工具 → compact / retry。
 * 只读工具可并发，写工具串行。Desktop 策略不在这（见 agent-runtime）。
 */

import type {
  SDKMessage,
  QueryEngineConfig,
  ToolDefinition,
  ToolResult,
  ToolContext,
  TokenUsage,
} from "./types.js";
import type {
  LLMProvider,
  CreateMessageResponse,
  NormalizedMessageParam,
  NormalizedTool,
  StreamingChunk,
} from "./providers/types.js";
import {
  estimateMessagesTokens,
  estimateCost,
  estimateSystemPromptTokens,
  getAutoCompactThreshold,
} from "./utils/tokens.js";
import {
  shouldAutoCompact,
  compactConversation,
  microCompactMessages,
  createAutoCompactState,
  type AutoCompactState,
} from "./utils/compact.js";
import {
  withRetry,
  isPromptTooLongError,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
} from "./utils/retry.js";
import {
  getSystemContext,
  getCurrentDateContext,
  readProjectContextContent,
} from "./utils/context.js";
import { normalizeMessagesForAPI } from "./utils/messages.js";
import type { HookRegistry, HookInput, HookOutput } from "./hooks.js";
import type { TraceRecorder } from "./trace.js";
import { createHash } from "crypto";

/**
 * 将 SDK 内部工具定义转换为 Provider 无关的请求格式。
 *
 * Provider 只能看到名称、描述和 schema，执行实现及权限检查始终留在 Engine。
 */
function toProviderTool(tool: ToolDefinition): NormalizedTool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  };
}

/**
 * 从 Provider 响应中提取的单个工具调用块。
 *
 * `input` 在执行权限检查后可能被替换，不能假设其始终等于模型原始输出。
 */
interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: any;
}

/**
 * 组装可复用的稳定 system prompt，例如工具目录和项目上下文。
 *
 * 动态环境信息刻意不放在这里，以便 Prompt Cache 不会因每轮变化而失效。
 */
async function buildSystemPrompt(config: QueryEngineConfig): Promise<string> {
  if (config.systemPrompt) {
    return config.systemPrompt;
  }

  const parts: string[] = [];

  parts.push(
    "You are an AI assistant with access to tools. Use the tools provided to help the user accomplish their tasks.",
    "You should use tools when they would help you complete the task more accurately or efficiently.",
  );

  // List available tools with descriptions
  parts.push("\n# Available Tools\n");
  for (const tool of config.tools) {
    parts.push(`- **${tool.name}**: ${tool.description}`);
  }

  // Add agent definitions
  if (config.agents && Object.keys(config.agents).length > 0) {
    parts.push("\n# Available Subagents\n");
    for (const [name, def] of Object.entries(config.agents)) {
      parts.push(`- **${name}**: ${def.description}`);
    }
  }

  // Static project context (AGENTS.md/AGENT.md/CLAUDE.md).
  try {
    const userCtx = await readProjectContextContent(config.cwd);
    if (userCtx) {
      parts.push("\n# Project Context\n");
      parts.push(userCtx);
    }
  } catch {
    // Context is best-effort
  }

  return parts.join("\n");
}

/**
 * 组装每次请求都会变化的运行时上下文。
 *
 * 环境读取是 best-effort，失败不能阻断 Agent 主循环；追加指令放在末尾以保持调用方覆盖优先级。
 */
async function buildRuntimeContext(config: QueryEngineConfig): Promise<string> {
  const parts: string[] = [];

  parts.push(getCurrentDateContext());

  if (config.includeEnvironmentContext !== false) {
    try {
      const sysCtx = await getSystemContext(config.cwd);
      if (sysCtx) parts.push(`# environment\n${sysCtx}`);
    } catch {
      // Context is best-effort
    }
  }

  parts.push(`# workingDirectory\n${config.cwd}`);

  if (config.appendSystemPrompt?.trim()) {
    parts.push(`# runtimeInstructions\n${config.appendSystemPrompt.trim()}`);
  }

  return parts.join("\n\n");
}

/**
 * 将值序列化为键顺序稳定的 JSON 字符串。
 *
 * Prompt Cache 的 key 依赖此稳定性，普通 JSON.stringify 会因对象插入顺序造成无效缓存。
 */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * 为稳定序列化结果生成短哈希，供 Prompt Cache key 使用。
 *
 * 哈希只标识缓存输入，并不作为安全校验或数据完整性证明。
 */
function hashStable(value: unknown): string {
  return createHash("sha256")
    .update(stableJson(value))
    .digest("hex")
    .slice(0, 16);
}

/**
 * 解析 Provider 请求使用的 Prompt Cache 配置与默认 key。
 *
 * 显式 key 优先，未指定时同时绑定模型、工具和稳定系统提示，避免跨策略复用缓存。
 */
function resolvePromptCache(
  config: QueryEngineConfig,
  systemPrompt: string,
  tools: NormalizedTool[],
): QueryEngineConfig["promptCache"] | undefined {
  if (!config.promptCache?.enabled) return undefined;

  return {
    ...config.promptCache,
    key:
      config.promptCache.key ??
      `agent:${config.model}:tools:${hashStable(tools)}:system:${hashStable(systemPrompt)}`,
  };
}

// ============================================================================
// QueryEngine
// ============================================================================

/**
 * 持有消息历史，驱动 Provider 和工具。
 * messages 是 Anthropic 风格；对外再映射成 SDKMessage。
 */
export class QueryEngine {
  /** compact 会直接改这个数组 */
  public messages: NormalizedMessageParam[] = [];
  private config: QueryEngineConfig;
  private provider: LLMProvider;
  private totalUsage: TokenUsage = { input_tokens: 0, output_tokens: 0 };
  private totalCost = 0;
  private turnCount = 0;
  private compactState: AutoCompactState;
  private sessionId: string;
  private apiTimeMs = 0;
  private hookRegistry?: HookRegistry;
  private traceRecorder?: TraceRecorder;
  /** 同名工具连续失败次数 */
  private failedToolCalls = new Map<string, number>();

  /**
   * 初始化一次会话的消息、统计和可选扩展点。
   *
   * 构造函数不发起 Provider 请求；执行必须从 `submitMessage` 显式开始。
   */
  constructor(config: QueryEngineConfig) {
    this.config = config;
    this.provider = config.provider;
    this.compactState = createAutoCompactState();
    this.sessionId = config.sessionId || crypto.randomUUID();
    this.hookRegistry = config.hookRegistry;
    this.traceRecorder = config.traceRecorder;
  }

  /**
   * 返回本次请求使用的重试配置。
   *
   * 会话显式配置优先于 SDK 默认值，避免 Provider 瞬态故障绕过调用方设定。
   */
  private get apiRetryConfig(): RetryConfig {
    return this.config.apiRetry ?? DEFAULT_RETRY_CONFIG;
  }

  /**
   * 执行一个生命周期 Hook，并将 Hook 自身故障降级为空结果。
   *
   * Hook 可以主动阻断流程，但其实现异常不能让 Agent 主循环失去恢复和 trace 机会。
   */
  private async executeHooks(
    event: import("./hooks.js").HookEvent,
    extra?: Partial<HookInput>,
  ): Promise<HookOutput[]> {
    if (!this.hookRegistry?.hasHooks(event)) return [];
    try {
      return await this.hookRegistry.execute(event, {
        event,
        sessionId: this.sessionId,
        cwd: this.config.cwd,
        ...extra,
      });
    } catch {
      return [];
    }
  }

  /**
   * 将用户消息加入会话并驱动完整的 Provider—工具—重试循环。
   *
   * 返回流同时承载增量文本、工具结果和 trace；调用方必须持续消费至最终 result 才能得到完整生命周期事件。
   */
  async *submitMessage(prompt: string | any[]): AsyncGenerator<SDKMessage> {
    // Hook: SessionStart
    await this.executeHooks("SessionStart");

    // Hook: UserPromptSubmit
    const userHookResults = await this.executeHooks("UserPromptSubmit", {
      toolInput: prompt,
    });
    // Check if any hook blocks the submission
    if (userHookResults.some((r) => r.block)) {
      yield {
        type: "result",
        subtype: "error_during_execution",
        is_error: true,
        usage: this.totalUsage,
        num_turns: 0,
        cost: 0,
        errors: ["Blocked by UserPromptSubmit hook"],
      };
      return;
    }

    // Build tool definitions for provider
    const tools = this.config.tools.map(toProviderTool);

    // Build system prompt
    const systemPrompt = await buildSystemPrompt(this.config);
    const runtimeContext = await buildRuntimeContext(this.config);
    const promptCache = resolvePromptCache(this.config, systemPrompt, tools);

    if (runtimeContext.trim()) {
      this.messages.push({ role: "user", content: runtimeContext });
    }

    // Add user message after runtime context so dynamic context stays near the tail.
    this.messages.push({ role: "user", content: prompt as any });

    // Emit init system message
    yield {
      type: "system",
      subtype: "init",
      session_id: this.sessionId,
      tools: this.config.tools.map((t) => t.name),
      model: this.config.model,
      cwd: this.config.cwd,
      mcp_servers: [],
      permission_mode: "bypassPermissions",
    } as SDKMessage;

    // Agentic loop
    let turnsRemaining = this.config.maxTurns;
    let budgetExceeded = false;
    let maxOutputRecoveryAttempts = 0;
    // 限制连续“继续输出”请求，避免模型反复耗尽输出上限时形成无终止循环。
    const MAX_OUTPUT_RECOVERY = 3;

    while (turnsRemaining > 0) {
      if (this.config.abortSignal?.aborted) break;

      // Check budget
      if (
        this.config.maxBudgetUsd &&
        this.totalCost >= this.config.maxBudgetUsd
      ) {
        budgetExceeded = true;
        break;
      }

      // Auto-compact if context is too large
      if (
        shouldAutoCompact(
          this.messages as any[],
          this.config.model,
          this.compactState,
        )
      ) {
        await this.executeHooks("PreCompact");
        const messageCountBefore = this.messages.length;
        try {
          const result = await compactConversation(
            this.provider,
            this.config.model,
            this.messages as any[],
            this.compactState,
          );
          this.messages = result.compactedMessages as NormalizedMessageParam[];
          this.compactState = result.state;
          await this.executeHooks("PostCompact");
          const compactSpan = this.traceRecorder?.recordCompact({
            reason: "auto",
            messageCountBefore,
          });
          if (compactSpan) yield { type: "trace", span: compactSpan };
        } catch {
          // Continue with uncompacted messages
        }
      }

      // Micro-compact: truncate large tool results
      const apiMessages = microCompactMessages(
        normalizeMessagesForAPI(this.messages as any[]),
      ) as NormalizedMessageParam[];

      this.turnCount++;
      turnsRemaining--;

      const turnStartSpan = this.traceRecorder?.recordTurnStart(this.turnCount);
      if (turnStartSpan) yield { type: "trace", span: turnStartSpan };

      // Make API call with retry via provider
      let response: CreateMessageResponse;
      const apiStart = performance.now();
      const useStreaming =
        this.config.stream &&
        typeof this.provider.createStreamingMessage === "function";

      const llmRequestSpan = this.traceRecorder?.recordLlmRequest(
        this.turnCount,
        {
          model: this.config.model,
          system: systemPrompt,
          messages: apiMessages,
          tools: tools.length > 0 ? tools : undefined,
          maxTokens: this.config.maxTokens,
          thinking:
            this.config.thinking?.type === "enabled" &&
            this.config.thinking.budgetTokens
              ? {
                  type: "enabled",
                  budget_tokens: this.config.thinking.budgetTokens,
                }
              : undefined,
          promptCache,
          estimatedInputTokens:
            estimateMessagesTokens(apiMessages as any[]) +
            estimateSystemPromptTokens(systemPrompt),
        },
      );
      if (llmRequestSpan) yield { type: "trace", span: llmRequestSpan };

      try {
        if (useStreaming) {
          // Streaming path: consume chunks and yield partial messages
          // async generator 的 fetch 在首次 next() 才执行；先 prime 再交给 withRetry
          /**
           * 创建并预取流的首个 chunk，使连接错误发生在 withRetry 覆盖范围内。
           *
           * async generator 的请求会延迟到首次 next；不预取将导致网络失败绕过重试策略。
           */
          const makeStream = async () => {
            const gen = this.provider.createStreamingMessage!({
              model: this.config.model,
              maxTokens: this.config.maxTokens,
              system: systemPrompt,
              messages: apiMessages,
              tools: tools.length > 0 ? tools : undefined,
              thinking:
                this.config.thinking?.type === "enabled" &&
                this.config.thinking.budgetTokens
                  ? {
                      type: "enabled",
                      budget_tokens: this.config.thinking.budgetTokens,
                    }
                  : undefined,
              promptCache,
            });
            const iterator = gen[Symbol.asyncIterator]();
            const first = await iterator.next();
            return (async function* () {
              if (!first.done) yield first.value;
              while (true) {
                const next = await iterator.next();
                if (next.done) break;
                yield next.value;
              }
            })();
          };

          const stream = await withRetry(
            makeStream,
            this.apiRetryConfig,
            this.config.abortSignal,
          );
          response = {
            content: [],
            stopReason: "end_turn",
            usage: { input_tokens: 0, output_tokens: 0 },
          };

          for await (const chunk of stream) {
            if (this.config.abortSignal?.aborted) break;

            if (chunk.type === "text_delta") {
              yield {
                type: "partial_message",
                partial: {
                  type: "text",
                  text: chunk.text,
                },
              };
            } else if (chunk.type === "thinking_delta") {
              yield {
                type: "partial_message",
                partial: {
                  type: "thinking",
                  thinking: chunk.thinking,
                },
              };
            } else if (chunk.type === "tool_use_start") {
              yield {
                type: "partial_message",
                partial: {
                  type: "tool_use",
                  name: chunk.name,
                  input: "",
                },
              };
            } else if (chunk.type === "tool_use_input_delta") {
              yield {
                type: "partial_message",
                partial: {
                  type: "tool_use",
                  name: "",
                  input: chunk.input_json_delta,
                },
              };
            } else if (chunk.type === "message_stop") {
              response = {
                content: chunk.content,
                stopReason: chunk.stopReason,
                usage: chunk.usage,
              };
            }
          }
        } else {
          // Non-streaming path
          response = await withRetry(
            async () => {
              return this.provider.createMessage({
                model: this.config.model,
                maxTokens: this.config.maxTokens,
                system: systemPrompt,
                messages: apiMessages,
                tools: tools.length > 0 ? tools : undefined,
                thinking:
                  this.config.thinking?.type === "enabled" &&
                  this.config.thinking.budgetTokens
                    ? {
                        type: "enabled",
                        budget_tokens: this.config.thinking.budgetTokens,
                      }
                    : undefined,
                promptCache,
              });
            },
            this.apiRetryConfig,
            this.config.abortSignal,
          );
        }
      } catch (err: any) {
        // Handle prompt-too-long by compacting
        if (isPromptTooLongError(err) && !this.compactState.compacted) {
          try {
            const result = await compactConversation(
              this.provider,
              this.config.model,
              this.messages as any[],
              this.compactState,
            );
            this.messages =
              result.compactedMessages as NormalizedMessageParam[];
            this.compactState = result.state;
            turnsRemaining++; // Retry this turn
            this.turnCount--;
            continue;
          } catch {
            // Can't compact, give up
          }
        }

        yield {
          type: "result",
          subtype: "error",
          is_error: true,
          usage: this.totalUsage,
          num_turns: this.turnCount,
          cost: this.totalCost,
          errors: [err instanceof Error ? err.message : String(err)],
        };
        return;
      }

      // Track API timing
      const apiDurationMs = Math.round(performance.now() - apiStart);
      this.apiTimeMs += apiDurationMs;

      const llmResponseSpan = this.traceRecorder?.recordLlmResponse(
        this.turnCount,
        {
          content: response.content,
          stopReason: response.stopReason,
          usage: response.usage,
        },
        apiDurationMs,
      );
      if (llmResponseSpan) yield { type: "trace", span: llmResponseSpan };

      // Track usage (normalized by provider)
      if (response.usage) {
        this.totalUsage.input_tokens += response.usage.input_tokens;
        this.totalUsage.output_tokens += response.usage.output_tokens;
        if (response.usage.cache_creation_input_tokens) {
          this.totalUsage.cache_creation_input_tokens =
            (this.totalUsage.cache_creation_input_tokens || 0) +
            response.usage.cache_creation_input_tokens;
        }
        if (response.usage.cache_read_input_tokens) {
          this.totalUsage.cache_read_input_tokens =
            (this.totalUsage.cache_read_input_tokens || 0) +
            response.usage.cache_read_input_tokens;
        }
        if (response.usage.cached_input_tokens) {
          this.totalUsage.cached_input_tokens =
            (this.totalUsage.cached_input_tokens || 0) +
            response.usage.cached_input_tokens;
        }
        this.totalCost += estimateCost(this.config.model, response.usage);
      }

      // Add assistant message to conversation
      this.messages.push({
        role: "assistant",
        content: response.content as any,
      });

      // Yield assistant message
      yield {
        type: "assistant",
        message: {
          role: "assistant",
          content: response.content as any,
        },
      };

      // Handle max_output_tokens recovery
      if (
        response.stopReason === "max_tokens" &&
        maxOutputRecoveryAttempts < MAX_OUTPUT_RECOVERY
      ) {
        maxOutputRecoveryAttempts++;
        // Add continuation prompt
        this.messages.push({
          role: "user",
          content: "Please continue from where you left off.",
        });
        continue;
      }

      // Check for tool use
      const toolUseBlocks = response.content.filter(
        (block): block is ToolUseBlock => block.type === "tool_use",
      );

      if (toolUseBlocks.length === 0) {
        break; // No tool calls - agent is done
      }

      // Reset max_output recovery counter on successful tool use
      maxOutputRecoveryAttempts = 0;

      // Execute tools (concurrent read-only, serial mutations)
      const toolResults = await this.executeTools(
        toolUseBlocks,
        this.turnCount,
      );

      // Yield tool results and trace spans
      for (const result of toolResults) {
        const traceSpans = (result as any)._traceSpans as
          | import("./trace.js").TraceSpan[]
          | undefined;
        if (traceSpans) {
          for (const span of traceSpans) {
            yield { type: "trace", span };
          }
        }
        yield {
          type: "tool_result",
          result: {
            tool_use_id: result.tool_use_id,
            tool_name: result.tool_name || "",
            output:
              typeof result.content === "string"
                ? result.content
                : JSON.stringify(result.content),
          },
        };
      }

      // Add tool results to conversation
      this.messages.push({
        role: "user",
        content: toolResults.map((r) => ({
          type: "tool_result" as const,
          tool_use_id: r.tool_use_id,
          content:
            typeof r.content === "string"
              ? r.content
              : JSON.stringify(r.content),
          is_error: r.is_error,
        })),
      });

      if (response.stopReason === "end_turn") break;
    }

    // Hook: Stop (end of agentic loop)
    await this.executeHooks("Stop");

    // Hook: SessionEnd
    await this.executeHooks("SessionEnd");

    // Yield enriched final result
    const endSubtype = budgetExceeded
      ? "error_max_budget_usd"
      : turnsRemaining <= 0
        ? "error_max_turns"
        : "success";

    yield {
      type: "result",
      subtype: endSubtype,
      session_id: this.sessionId,
      is_error: endSubtype !== "success",
      num_turns: this.turnCount,
      total_cost_usd: this.totalCost,
      duration_api_ms: Math.round(this.apiTimeMs),
      usage: this.totalUsage,
      model_usage: {
        [this.config.model]: {
          input_tokens: this.totalUsage.input_tokens,
          output_tokens: this.totalUsage.output_tokens,
        },
      },
      cost: this.totalCost,
    };
  }

  /**
   * 跑本轮工具。
   * 只读最多并发 AGENT_SDK_MAX_TOOL_CONCURRENCY（默认 10）；写/Bash 串行。
   */
  private async executeTools(
    toolUseBlocks: ToolUseBlock[],
    turn: number,
  ): Promise<(ToolResult & { tool_name?: string })[]> {
    const context: ToolContext = {
      cwd: this.config.cwd,
      abortSignal: this.config.abortSignal,
      provider: this.provider,
      model: this.config.model,
      apiType: this.provider.apiType,
      subprocessEnv: this.config.subprocessEnv,
    };

    const MAX_CONCURRENCY = parseInt(
      process.env.AGENT_SDK_MAX_TOOL_CONCURRENCY || "10",
    );

    // Partition into read-only (concurrent) and mutation (serial)
    const readOnly: Array<{ block: ToolUseBlock; tool?: ToolDefinition }> = [];
    const mutations: Array<{ block: ToolUseBlock; tool?: ToolDefinition }> = [];

    for (const block of toolUseBlocks) {
      const tool = this.config.tools.find((t) => t.name === block.name);
      if (tool?.isReadOnly?.()) {
        readOnly.push({ block, tool });
      } else {
        mutations.push({ block, tool });
      }
    }

    const results: (ToolResult & { tool_name?: string })[] = [];

    // Execute read-only tools concurrently (batched by MAX_CONCURRENCY)
    for (let i = 0; i < readOnly.length; i += MAX_CONCURRENCY) {
      const batch = readOnly.slice(i, i + MAX_CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((item) =>
          this.executeSingleTool(item.block, item.tool, context, turn),
        ),
      );
      results.push(...batchResults);
    }

    // Execute mutation tools sequentially
    for (const item of mutations) {
      const result = await this.executeSingleTool(
        item.block,
        item.tool,
        context,
        turn,
      );
      results.push(result);
    }

    return results;
  }

  /**
   * 执行一个工具调用，并将权限、Hook、trace、重试上限和结果转换集中在同一边界。
   *
   * 未知工具、拒绝和执行失败均返回 `is_error` ToolResult，而非中断整个 Agent 回合。
   */
  private async executeSingleTool(
    block: ToolUseBlock,
    tool: ToolDefinition | undefined,
    context: ToolContext,
    turn: number,
  ): Promise<
    ToolResult & {
      tool_name?: string;
      _traceSpans?: import("./trace.js").TraceSpan[];
    }
  > {
    const traceSpans: import("./trace.js").TraceSpan[] = [];
    const toolStart = performance.now();

    /**
     * 记录工具开始 span；它必须先于任何成功、拒绝或未知工具的结果 span 写入。
     */
    const emitToolCall = () => {
      const span = this.traceRecorder?.recordToolCall(turn, {
        toolUseId: block.id,
        name: block.name,
        input: block.input,
      });
      if (span) traceSpans.push(span);
    };

    /**
     * 以同一开始时间计算工具结果耗时，并把结果 span 追加到本调用的 trace 集合。
     */
    const emitToolResult = (output: string, isError: boolean, name: string) => {
      const durationMs = Math.round(performance.now() - toolStart);
      const span = this.traceRecorder?.recordToolResult(
        turn,
        { toolUseId: block.id, name, output, isError },
        durationMs,
      );
      if (span) traceSpans.push(span);
    };

    /**
     * 将执行结果与本次调用积累的 trace spans 一并返回给上游汇总器。
     */
    const withTrace = (result: ToolResult & { tool_name?: string }) => ({
      ...result,
      _traceSpans: traceSpans.length > 0 ? traceSpans : undefined,
    });
    if (!tool) {
      emitToolCall();
      const msg = `Error: Unknown tool "${block.name}"`;
      emitToolResult(msg, true, block.name);
      return withTrace({
        type: "tool_result",
        tool_use_id: block.id,
        content: msg,
        is_error: true,
        tool_name: block.name,
      });
    }

    // Check enabled
    if (tool.isEnabled && !tool.isEnabled()) {
      emitToolCall();
      const msg = `Error: Tool "${block.name}" is not enabled`;
      emitToolResult(msg, true, block.name);
      return withTrace({
        type: "tool_result",
        tool_use_id: block.id,
        content: msg,
        is_error: true,
        tool_name: block.name,
      });
    }

    // Check permissions
    if (this.config.canUseTool) {
      try {
        const permission = await this.config.canUseTool(tool, block.input);
        if (permission.behavior === "deny") {
          emitToolCall();
          const msg =
            permission.message || `Permission denied for tool "${block.name}"`;
          emitToolResult(msg, true, block.name);
          return withTrace({
            type: "tool_result",
            tool_use_id: block.id,
            content: msg,
            is_error: true,
            tool_name: block.name,
          });
        }
        if (permission.updatedInput !== undefined) {
          block = { ...block, input: permission.updatedInput };
        }
      } catch (err: any) {
        emitToolCall();
        const msg = `Permission check error: ${err.message}`;
        emitToolResult(msg, true, block.name);
        return withTrace({
          type: "tool_result",
          tool_use_id: block.id,
          content: msg,
          is_error: true,
          tool_name: block.name,
        });
      }
    }

    // Hook: PreToolUse
    const preHookResults = await this.executeHooks("PreToolUse", {
      toolName: block.name,
      toolInput: block.input,
      toolUseId: block.id,
    });
    // Check if any hook blocks this tool
    if (preHookResults.some((r) => r.block)) {
      emitToolCall();
      const msg =
        preHookResults.find((r) => r.message)?.message ||
        "Blocked by PreToolUse hook";
      emitToolResult(msg, true, block.name);
      return withTrace({
        type: "tool_result",
        tool_use_id: block.id,
        content: msg,
        is_error: true,
        tool_name: block.name,
      });
    }

    emitToolCall();

    const retryKey = `${block.name}:${JSON.stringify(block.input)}`;
    const retryLimit = this.config.maxSameToolRetries;
    if (
      retryLimit !== undefined &&
      (this.failedToolCalls.get(retryKey) ?? 0) >= retryLimit
    ) {
      const msg = `Error: repeated failed tool call blocked after ${retryLimit} attempts`;
      emitToolResult(msg, true, block.name);
      return withTrace({
        type: "tool_result",
        tool_use_id: block.id,
        content: msg,
        is_error: true,
        tool_name: block.name,
      });
    }

    // Execute the tool
    try {
      const result = await tool.call(block.input, context);

      // Hook: PostToolUse
      await this.executeHooks("PostToolUse", {
        toolName: block.name,
        toolInput: block.input,
        toolOutput:
          typeof result.content === "string"
            ? result.content
            : JSON.stringify(result.content),
        toolUseId: block.id,
      });

      const output =
        typeof result.content === "string"
          ? result.content
          : JSON.stringify(result.content);
      emitToolResult(output, !!result.is_error, block.name);
      if (result.is_error)
        this.failedToolCalls.set(
          retryKey,
          (this.failedToolCalls.get(retryKey) ?? 0) + 1,
        );
      // Trace receives the unmodified output. Only the next model turn sees a transformed result.
      const modelResult = this.config.toolResultTransformer
        ? this.config.toolResultTransformer(result, { toolName: block.name })
        : result;
      return withTrace({
        ...modelResult,
        tool_use_id: block.id,
        tool_name: block.name,
      });
    } catch (err: any) {
      // Hook: PostToolUseFailure
      await this.executeHooks("PostToolUseFailure", {
        toolName: block.name,
        toolInput: block.input,
        toolUseId: block.id,
        error: err.message,
      });

      const msg = `Tool execution error: ${err.message}`;
      emitToolResult(msg, true, block.name);
      this.failedToolCalls.set(
        retryKey,
        (this.failedToolCalls.get(retryKey) ?? 0) + 1,
      );

      return withTrace({
        type: "tool_result",
        tool_use_id: block.id,
        content: msg,
        is_error: true,
        tool_name: block.name,
      });
    }
  }

  /**
   * 返回当前消息历史的浅副本，供上层持久化会话。
   *
   * 仅复制数组容器；消息内容仍应由调用方按只读快照处理。
   */
  getMessages(): NormalizedMessageParam[] {
    return [...this.messages];
  }

  /**
   * 返回本 Engine 生命周期内累计的 Provider token 用量快照。
   *
   * 缓存 token 字段可能不存在，取决于 Provider 是否提供对应统计。
   */
  getUsage(): TokenUsage {
    return { ...this.totalUsage };
  }

  /**
   * 返回本 Engine 生命周期内的估算成本。
   *
   * 估算依赖已知模型价格表，不能替代 Provider 账单的最终金额。
   */
  getCost(): number {
    return this.totalCost;
  }
}
