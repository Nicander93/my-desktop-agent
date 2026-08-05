/**
 * agent:* IPC。conversationId 当 sessionId 用。
 * 组装 cwd/MCP/Skill/模型/env，调 AgentRuntime，流式事件推 agent:stream-message。
 * 改 channel 同步改 preload 和 electron.d.ts。
 */
import { ipcMain, BrowserWindow } from "electron";
import {
  AgentRuntime,
  classifyRuntimeProfile,
  type RuntimeOptions,
} from "@desktop-agent/agent-runtime";
import type { AgentSendMessageOptions } from "@desktop-agent/shared";
import { parseSkillMentions } from "@desktop-agent/shared";
import * as conversationService from "../services/conversationService";
import * as workspaceService from "../services/workspaceService";
import * as modelConfigService from "../services/modelConfigService";
import { getEnabledMcpServersForWorkspace } from "./mcpHandlers";
import { getRuntimeSkillDefinitions } from "./skillHandlers";
import {
  BinaryManager,
  isRuntimeReady,
  getRuntimeInitError,
} from "../runtime/manager";
import {
  buildSubprocessEnv,
  mergeRuntimeEnvIntoMcpServers,
} from "../runtime/policy";
import {
  getAttachmentsForMessage,
  linkAttachments,
  readAttachmentBase64,
} from "../services/attachmentService";

/**
 * 读取主进程环境变量及 electron-vite 注入的同名备用前缀。
 *
 * 仅在 Host 边界处理此前缀兼容，Runtime 不应依赖构建工具的环境变量约定。
 */
function readEnv(name: string): string | undefined {
  return process.env[name] || process.env[`MAIN_VITE_${name}`];
}

/**
 * 根据对话查找其所属工作区的 cwd 与稳定 ID。
 *
 * 已删除对话或工作区返回 undefined，由 IPC handler 转换为用户可理解的失败响应。
 */
function resolveWorkspaceContext(
  conversationId: string,
): { cwd: string; workspaceId: string } | undefined {
  const conversation = conversationService.getConversation(conversationId);
  if (!conversation) return undefined;
  const workspace = workspaceService.getWorkspace(conversation.workspaceId);
  if (!workspace) return undefined;
  return { cwd: workspace.path, workspaceId: workspace.id };
}

/**
 * 从消息流抽错误文案。
 * 已经有 assistant 就当成功；否则看 result.errors / subtype。
 */
function getAgentErrorFromMessages(messages: any[]): string | undefined {
  const hasAssistant = messages.some((msg) => msg?.type === "assistant");
  if (hasAssistant) return undefined;

  const result = messages.find((msg) => msg?.type === "result");
  if (!result) return undefined;

  if (Array.isArray(result.errors) && result.errors.length > 0) {
    return result.errors.join("；");
  }

  if (result.subtype === "error") {
    return "模型请求失败，请检查所选模型配置的模型名称、Base URL 与 API Key";
  }

  return `Agent 请求失败（${result.subtype || "unknown"}）`;
}

/**
 * 在 Windows bundled runtime 未就绪时生成统一的阻断原因。
 *
 * 该检查必须发生在创建 Agent 前，避免配置正确但子进程不可用时产生误导性模型错误。
 */
function getRuntimeBlockedMessage(): string | undefined {
  if (process.platform === "win32" && !isRuntimeReady()) {
    return (
      getRuntimeInitError() ?? "运行时未就绪，请先运行 pnpm setup:binaries"
    );
  }
  return undefined;
}

/**
 * 将文本和已持久化的图片附件转换为 SDK 可消费的 prompt 内容。
 *
 * 附件只允许通过当前 session 读取；链接到消息的操作在流开始前完成，保证重载历史时仍可追溯。
 */
function buildPromptContent(
  sessionId: string,
  content: string,
  options?: AgentSendMessageOptions,
): string | any[] {
  const refs = options?.attachments ?? [];
  if (refs.length === 0) return content;

  const attachments = getAttachmentsForMessage(refs, sessionId);
  if (options?.messageId) {
    linkAttachments(refs, sessionId, options.messageId);
  }

  const blocks: any[] = [
    {
      type: "text",
      text: content.trim() || "请识别这张图片",
    },
  ];

  for (const attachment of attachments) {
    blocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: attachment.mimeType,
        data: readAttachmentBase64(attachment),
      },
    });
  }

  return blocks;
}

/**
 * 注册 Agent IPC handlers，并编排 Host 服务与 Runtime 之间的调用。
 *
 * 依赖由 main 注入以避免初始化循环；新增 channel 时必须同步更新 preload 与 renderer 的 electron.d.ts。
 */
export function registerAgentHandlers(
  getRuntime: () => AgentRuntime,
  getMainWindow: () => BrowserWindow | null,
  getBinaryManager: () => BinaryManager,
): void {
  /**
   * 组装创建或复用会话 Agent 所需的工作区、模型、MCP、Skill 与默认子进程环境。
   *
   * 新建阶段固定采用 general 环境；实际 Profile 需等到有消息内容后分类，避免错误选择 office 专用二进制。
   */
  function buildAgentSessionOptions(conversationId: string) {
    const context = resolveWorkspaceContext(conversationId);
    if (!context) return undefined;

    const binaryManager = getBinaryManager();
    const conversation = conversationService.getConversation(conversationId);
    const modelConfig = conversation?.modelConfigId
      ? modelConfigService.getModelConfig(conversation.modelConfigId)
      : modelConfigService.getDefaultModelConfig();
    if (conversation?.modelConfigId && !modelConfig) {
      throw new Error("对话绑定的模型配置不存在，请在设置中重新选择模型");
    }
    // create 时先 general；真正发消息再按推断 profile 换 env
    const subprocessEnv = buildSubprocessEnv(
      "general",
      binaryManager.getPaths(),
    );
    const mcpServers = mergeRuntimeEnvIntoMcpServers(
      getEnabledMcpServersForWorkspace(context.cwd),
      subprocessEnv,
    );

    return {
      cwd: context.cwd,
      workspaceId: context.workspaceId,
      mcpServers,
      skills: getRuntimeSkillDefinitions(),
      subprocessEnv,
      modelConfig,
    };
  }

  /**
   * 解析单轮 Profile 并据此构造临时 Query 覆盖。
   *
   * 显式 Profile 优先；自动分类使用本对话的模型连接配置，随后重建子进程环境，不能沿用创建阶段的 general 环境。
   */
  async function buildAgentQueryOptions(
    sessionId: string,
    content: string,
    options?: AgentSendMessageOptions,
  ) {
    let profile = options?.profile;
    if (!profile) {
      const conversation = conversationService.getConversation(sessionId);
      const modelConfig = conversation?.modelConfigId
        ? modelConfigService.getModelConfig(conversation.modelConfigId)
        : modelConfigService.getDefaultModelConfig();
      const model =
        modelConfig?.model || readEnv("CODEANY_MODEL") || "gpt-4o-mini";
      profile = await classifyRuntimeProfile(content, {
        model,
        apiKey: modelConfig?.apiKey || readEnv("CODEANY_API_KEY") || undefined,
        baseURL:
          modelConfig?.baseURL || readEnv("CODEANY_BASE_URL") || undefined,
        apiType:
          (readEnv("CODEANY_API_TYPE") as
            | "anthropic-messages"
            | "openai-completions"
            | undefined) || "openai-completions",
      });
      console.log(`[profile] classified=${profile}`);
    } else {
      console.log(`[profile] explicit=${profile}`);
    }

    return {
      mcpMentions: options?.mcpMentions,
      fileRefs: options?.fileRefs,
      skillMentions: options?.skillMentions ?? parseSkillMentions(content),
      profile,
      subprocessEnv: buildSubprocessEnv(profile, getBinaryManager().getPaths()),
    };
  }

  ipcMain.handle("agent:create-session", (_, sessionId: string) => {
    const blocked = getRuntimeBlockedMessage();
    if (blocked) return { success: false, error: blocked };

    const sessionOptions = buildAgentSessionOptions(sessionId);
    if (!sessionOptions) {
      return { success: false, error: "找不到对话所属工作区" };
    }
    getRuntime().createAgent(sessionId, sessionOptions);
    return { success: true, sessionId };
  });

  ipcMain.handle(
    "agent:send-message",
    async (
      _,
      sessionId: string,
      content: string,
      options?: AgentSendMessageOptions,
    ) => {
      try {
        const blocked = getRuntimeBlockedMessage();
        if (blocked) return { success: false, error: blocked };

        const sessionOptions = buildAgentSessionOptions(sessionId);
        if (!sessionOptions) {
          return {
            success: false,
            error: "找不到对话所属工作区，请确认工作区存在",
          };
        }

        const runtime = getRuntime();
        const promptContent = buildPromptContent(sessionId, content, options);
        const stream = await runtime.sendMessage(
          sessionId,
          promptContent,
          sessionOptions,
          await buildAgentQueryOptions(sessionId, content, options),
        );
        const messages: any[] = [];

        for await (const msg of stream) {
          messages.push(msg);
          getMainWindow()?.webContents.send("agent:stream-message", {
            sessionId,
            message: msg,
          });
        }

        const agentError = getAgentErrorFromMessages(messages);
        if (agentError) {
          return { success: false, error: agentError, messages };
        }

        return { success: true, messages };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  ipcMain.handle(
    "agent:prompt",
    async (
      _,
      sessionId: string,
      content: string,
      options?: AgentSendMessageOptions,
    ) => {
      try {
        const blocked = getRuntimeBlockedMessage();
        if (blocked) return { success: false, error: blocked };

        const sessionOptions = buildAgentSessionOptions(sessionId);
        if (!sessionOptions) {
          return {
            success: false,
            error: "找不到对话所属工作区，请确认工作区存在",
          };
        }

        const result = await getRuntime().prompt(
          sessionId,
          content,
          sessionOptions,
          await buildAgentQueryOptions(sessionId, content, options),
        );
        return { success: true, content: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  ipcMain.handle("agent:get-messages", (_, sessionId: string) => {
    const messages = getRuntime().getMessages(sessionId);
    return { success: true, messages };
  });

  ipcMain.handle(
    "agent:get-trace-run",
    async (_, sessionId: string, runId: string) => {
      try {
        const traceRun = await getRuntime().getTraceRun(sessionId, runId);
        return { success: true, traceRun };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  ipcMain.handle("agent:get-latest-trace-run", async (_, sessionId: string) => {
    try {
      const traceRun = await getRuntime().getLatestTraceRun(sessionId);
      return { success: true, traceRun };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("agent:close-session", async (_, sessionId: string) => {
    await getRuntime().close(sessionId);
    return { success: true };
  });
}

/**
 * 解析 Host 环境中配置的模型思考模式与 token 预算。
 *
 * 非法预算回退到稳定默认值 8000，避免空或非数值环境变量导致 Provider 请求格式不一致。
 */
export function parseThinkingConfig(): RuntimeOptions["thinking"] {
  const mode = (readEnv("CODEANY_THINKING") || "enabled").toLowerCase();
  if (mode === "disabled" || mode === "off" || mode === "false") {
    return { type: "disabled" };
  }

  const budgetRaw = readEnv("CODEANY_THINKING_BUDGET");
  const budgetTokens = budgetRaw ? Number(budgetRaw) : 8000;

  if (mode === "adaptive") {
    return Number.isFinite(budgetTokens)
      ? { type: "adaptive", budgetTokens }
      : { type: "adaptive" };
  }

  return {
    type: "enabled",
    budgetTokens: Number.isFinite(budgetTokens) ? budgetTokens : 8000,
  };
}

/**
 * 暴露与 Agent 相关的环境变量读取兼容逻辑。
 *
 * 供 main 初始化复用，保持 `CODEANY_*` 与 `MAIN_VITE_CODEANY_*` 的优先级一致。
 */
export function readAgentEnv(name: string): string | undefined {
  return readEnv(name);
}
