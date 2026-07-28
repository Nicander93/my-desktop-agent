/**
 * profile 策略：office-pptx 走 officecli 快路径；office 为通用办公。
 * 交互侧分类见 classifyRuntimeProfile；coding 依赖隔离在 electron/runtime/policy。
 */
import type { AgentOptions } from '@codeany/open-agent-sdk';
import { getSkillPromptBody, OFFICECLI_PPTX_AGENT_SKILL } from '@desktop-agent/shared';
import type { AgentRuntimeProfile } from '@desktop-agent/shared';
import type { RuntimeOptions } from './runtime.js';

export type RuntimeProfile = AgentRuntimeProfile;

export interface ToolResultPolicy {
  maxChars: number;
  summarizeJson?: boolean;
  preserveHeadTail?: boolean;
}

/** 转成 AgentOptions 局部覆盖的那一块 */
export interface RuntimeProfilePolicy {
  profile: RuntimeProfile;
  maxTurns?: number;
  thinking?: RuntimeOptions['thinking'];
  allowedTools?: string[];
  disallowedTools?: string[];
  appendSystemPrompt?: string;
  toolResultPolicy?: ToolResultPolicy;
}

const OFFICE_TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'];

/**
 * office-pptx 系统提示：开头硬约束，优先于 skill / 官方文档。
 * 盖过 load_skill 里的 open→save Quick Start，并挡住 python-pptx 弯路。
 */
export const OFFICE_FAST_PATH_PROMPT = [
  '# office-pptx 硬约束（必须遵守）',
  '',
  '1. **做 PPT / .pptx 只能用 officecli batch**，禁止用 python-pptx、pptx、PIL 拼幻灯片。',
  '2. **Read / Write / Edit 优先工作区相对路径**（如 `input/a.csv`、`output/deck.pptx`、`batch.json`）；不要把 Git Bash 的 `/d/...` 和 Windows 路径混着用。',
  '3. 标准流程（尽量少工具调用）：',
  '   - 读/分析输入',
  '   - Write `batch.json`（PPT 操作列表）',
  '   - Bash: `officecli batch "output/xxx.pptx" --input "batch.json" --json`',
  '   - 可选一次：`officecli validate "output/xxx.pptx" --json` 或 `view outline`',
  '4. 禁止 Bash：`officecli open` / `close` / `save` / `watch` / `load_skill`（会阻塞）。',
  '5. 禁止：`officecli batch "batch.json" --json`（缺少目标 .pptx 路径）。',
  '6. help 只查当前缺的一条（如 `officecli help pptx shape`）；禁止 `help ... --json` 拉全量 schema。',
  '7. 失败只根据前几条错误做最小修补；不要无错重写整份 batch。',
  '',
  '## PPTX batch 参考',
  getSkillPromptBody(OFFICECLI_PPTX_AGENT_SKILL),
].join('\n');

/** 仅返回显式值；无显式则 general。模型分类走 classifyRuntimeProfile。 */
export function resolveExplicitProfile(explicit?: RuntimeProfile): RuntimeProfile {
  return explicit ?? 'general';
}

/** @deprecated 用 resolveExplicitProfile / classifyRuntimeProfile */
export function inferRuntimeProfile(_content: string, explicit?: RuntimeProfile): RuntimeProfile {
  return resolveExplicitProfile(explicit);
}

/** office-pptx 返回快路径；office 仅抬高回合、不开 PPT prompt */
export function getRuntimeProfilePolicy(profile?: RuntimeProfile): RuntimeProfilePolicy | undefined {
  if (profile === 'office-pptx') {
    return {
      profile: 'office-pptx',
      maxTurns: 8,
      thinking: { type: 'disabled' },
      allowedTools: [...OFFICE_TOOLS],
      appendSystemPrompt: OFFICE_FAST_PATH_PROMPT,
      toolResultPolicy: {
        maxChars: 4000,
        summarizeJson: true,
        preserveHeadTail: true,
      },
    };
  }

  if (profile === 'office') {
    return {
      profile: 'office',
      maxTurns: 24,
      allowedTools: [...OFFICE_TOOLS],
    };
  }

  return undefined;
}

/** 不含 appendSystemPrompt，那块由 runtime 自己拼 */
export function profilePolicyToAgentOptions(
  policy?: RuntimeProfilePolicy,
): Partial<AgentOptions> {
  if (!policy) return {};

  return {
    ...(policy.maxTurns ? { maxTurns: policy.maxTurns } : {}),
    ...(policy.thinking ? { thinking: policy.thinking } : {}),
    ...(policy.allowedTools ? { allowedTools: policy.allowedTools } : {}),
    ...(policy.disallowedTools ? { disallowedTools: policy.disallowedTools } : {}),
  };
}
