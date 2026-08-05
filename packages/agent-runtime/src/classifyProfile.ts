/**
 * 用同会话模型做一次短调用，把用户意图映射到 AgentRuntimeProfile。
 * 显式 profile 由调用方处理；这里只负责分类与枚举校验。
 */
import { createProvider, type ApiType } from "@codeany/open-agent-sdk";
import {
  AGENT_RUNTIME_PROFILES,
  isAgentRuntimeProfile,
  type AgentRuntimeProfile,
} from "@desktop-agent/shared";

const DEFAULT_PROFILE: AgentRuntimeProfile = "general";
const MAX_CONTENT_CHARS = 2000;
const CLASSIFY_TIMEOUT_MS = 15_000;

/**
 * 意图分类调用所需的模型连接参数，以及可替换的完成函数用于测试。
 */
export interface ClassifyRuntimeProfileOptions {
  model: string;
  apiKey?: string;
  baseURL?: string;
  apiType?: ApiType;
  /** 可注入，便于单测 */
  complete?: (params: {
    model: string;
    system: string;
    user: string;
  }) => Promise<string>;
}

/**
 * 构造严格限制枚举输出的分类系统提示，避免分类结果越出运行时 profile 范围。
 */
function buildClassifySystemPrompt(): string {
  const allowed = AGENT_RUNTIME_PROFILES.join(", ");
  return [
    "Classify the user request into exactly one runtime profile.",
    `Allowed profiles: ${allowed}.`,
    "office-pptx: create/edit PowerPoint / pptx / slides via officecli.",
    "office: spreadsheets, Word, CSV/table reconciliation, general office docs (not slide decks).",
    "coding: code change, tests, build, debug.",
    "file-organizing: rename/move/organize files.",
    "mcp: primarily using MCP servers/tools.",
    "general: anything else.",
    'Reply with JSON only: {"profile":"<one of the allowed profiles>"}.',
  ].join("\n");
}

/**
 * 从模型原始输出提取已验证 profile，兼容 JSON 与单 token 回复并安全回退。
 */
function extractProfile(raw: string): AgentRuntimeProfile {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { profile?: unknown };
      if (
        typeof parsed.profile === "string" &&
        isAgentRuntimeProfile(parsed.profile)
      ) {
        return parsed.profile;
      }
    } catch {
      // fall through
    }
  }
  const token = trimmed.replace(/^["']|["']$/g, "");
  if (isAgentRuntimeProfile(token)) return token;
  return DEFAULT_PROFILE;
}

/**
 * 用应用配置的 SDK provider 执行小 token 分类调用，并合并所有文本内容块。
 */
async function defaultComplete(
  opts: ClassifyRuntimeProfileOptions,
  system: string,
  user: string,
): Promise<string> {
  const provider = createProvider(opts.apiType ?? "openai-completions", {
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
  });
  const response = await provider.createMessage({
    model: opts.model,
    maxTokens: 64,
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = response.content
    .filter(
      (block): block is { type: "text"; text: string } => block.type === "text",
    )
    .map((block) => block.text)
    .join("");
  return text;
}

/**
 * 在有限输入和严格超时内分类用户意图；任何调用或解析失败均回退到 general。
 */
export async function classifyRuntimeProfile(
  content: string,
  opts: ClassifyRuntimeProfileOptions,
): Promise<AgentRuntimeProfile> {
  const user = content.trim().slice(0, MAX_CONTENT_CHARS) || "(empty)";
  const system = buildClassifySystemPrompt();
  try {
    const complete =
      opts.complete ??
      ((params) => defaultComplete(opts, params.system, params.user));
    const raw = await Promise.race([
      complete({ model: opts.model, system, user }),
      new Promise<string>((_, reject) => {
        setTimeout(
          () => reject(new Error("profile classify timeout")),
          CLASSIFY_TIMEOUT_MS,
        );
      }),
    ]);
    return extractProfile(raw);
  } catch {
    return DEFAULT_PROFILE;
  }
}
