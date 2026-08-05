/**
 * profile 策略：office-pptx 走 officecli 快路径；office 为通用办公。
 * 交互侧分类见 classifyRuntimeProfile；coding 依赖隔离在 electron/runtime/policy。
 */
import type { AgentOptions } from "@codeany/open-agent-sdk";
import {
  getSkillPromptBody,
  OFFICECLI_PPTX_AGENT_SKILL,
} from "@desktop-agent/shared";
import type { AgentRuntimeProfile } from "@desktop-agent/shared";
import type { RuntimeOptions } from "./runtime.js";

/**
 * Runtime 层使用的任务场景名称。
 *
 * 类型来自 shared IPC 契约；本层只负责将其转换为 SDK 可执行的局部策略。
 */
export type RuntimeProfile = AgentRuntimeProfile;

/**
 * 工具结果注入上下文前的截断策略。
 *
 * 截断上限用于控制 token 消耗，JSON 摘要与首尾保留只在工具结果适合时启用。
 */
export interface ToolResultPolicy {
  maxChars: number;
  summarizeJson?: boolean;
  preserveHeadTail?: boolean;
}

/**
 * 一个 Runtime Profile 对单轮 Agent 调用施加的局部覆盖。
 *
 * `appendSystemPrompt` 由 Runtime 与 mention 提示共同拼接，避免策略层决定提示的最终顺序。
 */
export interface RuntimeProfilePolicy {
  profile: RuntimeProfile;
  maxTurns?: number;
  thinking?: RuntimeOptions["thinking"];
  allowedTools?: string[];
  disallowedTools?: string[];
  appendSystemPrompt?: string;
  toolResultPolicy?: ToolResultPolicy;
}

/**
 * Office Profile 允许的最小工具集。
 *
 * 保持为稳定白名单，避免办公任务无意获得编程任务才需要的高风险工具。
 */
const OFFICE_TOOLS = ["Bash", "Read", "Write", "Edit", "Glob", "Grep"];

/**
 * office-pptx 系统提示：开头硬约束，优先于 skill / 官方文档。
 * 盖过 load_skill 里的 open→save Quick Start，并挡住 python-pptx 弯路。
 */
export const OFFICE_FAST_PATH_PROMPT = [
  "# office-pptx 硬约束（必须遵守）",
  "",
  "1. **做 .pptx / .xlsx 只用 officecli**：先 `create`，再 `batch`；禁止 python-pptx、openpyxl、PIL。",
  "2. **Read / Write / Edit 优先工作区相对路径**（如 `input/a.csv`、`output/deck.pptx`、`batch.json`）。",
  "3. 标准流程（尽量少工具调用）：",
  "   - 读/分析输入；`mkdir -p output`",
  '   - `officecli create "output/xxx.pptx" --json`（Excel 则 create `.xlsx`）',
  "   - Write `*-batch.json`",
  '   - `officecli batch "output/xxx.pptx" --input "pptx-batch.json" --json`',
  "   - 若还要 Excel：再 create xlsx → Write xlsx-batch → batch",
  "   - 可选一次：`validate` / `view outline`",
  "4. 禁止：`open` / `save` / `watch` / `load_skill`（会阻塞）。允许：`create`、必要时 `close`。",
  '5. 禁止：`officecli batch "batch.json" --json`（缺少目标 .pptx/.xlsx 路径）。',
  "6. **batch 不会自动建文件**；先 create，否则 file_not_found。",
  "7. help 只查一条（`help pptx shape` / `help excel cell`）；禁止 `help ... --json`。",
  '8. Excel 数字用 `type=number`；避免 `numberformat:"@"`；cell 用 `set` + `path":"/Sheet/A1"`。',
  "9. 失败只修前几条错误；不要无错重写整份 batch。",
  "",
  "## officecli 参考",
  getSkillPromptBody(OFFICECLI_PPTX_AGENT_SKILL),
].join("\n");

/**
 * 解析调用方显式选择的 Profile。
 *
 * 这里不进行内容分类；未指定时固定回退 general，模型分类应在 Host 的独立链路中执行。
 */
export function resolveExplicitProfile(
  explicit?: RuntimeProfile,
): RuntimeProfile {
  return explicit ?? "general";
}

/**
 * 保留旧调用方的显式 Profile 解析兼容入口。
 *
 * @deprecated 请分别使用 `resolveExplicitProfile` 或 `classifyRuntimeProfile`，避免将分类与覆盖混为一谈。
 */
export function inferRuntimeProfile(
  _content: string,
  explicit?: RuntimeProfile,
): RuntimeProfile {
  return resolveExplicitProfile(explicit);
}

/**
 * 获取会影响 SDK 执行方式的 Profile 覆盖。
 *
 * `office-pptx` 注入 officecli 快路径，而通用 `office` 只限制工具集并调整轮次，不能复用 PPT 专用提示。
 */
export function getRuntimeProfilePolicy(
  profile?: RuntimeProfile,
): RuntimeProfilePolicy | undefined {
  if (profile === "office-pptx") {
    return {
      profile: "office-pptx",
      maxTurns: 50,
      thinking: { type: "disabled" },
      allowedTools: [...OFFICE_TOOLS],
      appendSystemPrompt: OFFICE_FAST_PATH_PROMPT,
      toolResultPolicy: {
        maxChars: 4000,
        summarizeJson: true,
        preserveHeadTail: true,
      },
    };
  }

  if (profile === "office") {
    return {
      profile: "office",
      maxTurns: 24,
      allowedTools: [...OFFICE_TOOLS],
    };
  }

  return undefined;
}

/**
 * 将 Profile 策略转换为可直接传给 SDK 的字段。
 *
 * 系统提示保持由 Runtime 统一拼接，以维护 Profile、Skill、MCP 和文件 mention 的稳定优先级。
 */
export function profilePolicyToAgentOptions(
  policy?: RuntimeProfilePolicy,
): Partial<AgentOptions> {
  if (!policy) return {};

  return {
    ...(policy.maxTurns ? { maxTurns: policy.maxTurns } : {}),
    ...(policy.thinking ? { thinking: policy.thinking } : {}),
    ...(policy.allowedTools ? { allowedTools: policy.allowedTools } : {}),
    ...(policy.disallowedTools
      ? { disallowedTools: policy.disallowedTools }
      : {}),
  };
}
