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
  '1. **做 .pptx / .xlsx 只用 officecli**：先 `create`，再 `batch`；禁止 python-pptx、openpyxl、PIL。',
  '2. **Read / Write / Edit 优先工作区相对路径**（如 `input/a.csv`、`output/deck.pptx`、`batch.json`）。',
  '3. 标准流程（尽量少工具调用）：',
  '   - 读/分析输入；`mkdir -p output`',
  '   - `officecli create "output/xxx.pptx" --json`（Excel 则 create `.xlsx`）',
  '   - Write `*-batch.json`',
  '   - `officecli batch "output/xxx.pptx" --input "pptx-batch.json" --json`',
  '   - 若还要 Excel：再 create xlsx → Write xlsx-batch → batch',
  '   - 可选一次：`validate` / `view outline`',
  '4. 禁止：`open` / `save` / `watch` / `load_skill`（会阻塞）。允许：`create`、必要时 `close`。',
  '5. 禁止：`officecli batch "batch.json" --json`（缺少目标 .pptx/.xlsx 路径）。',
  '6. **batch 不会自动建文件**；先 create，否则 file_not_found。',
  '7. help 只查一条（`help pptx shape` / `help excel cell`）；禁止 `help ... --json`。',
  '8. Excel 数字用 `type=number`；避免 `numberformat:"@"`；cell 用 `set` + `path":"/Sheet/A1"`。',
  '9. 失败只修前几条错误；不要无错重写整份 batch。',
  '',
  '## officecli 参考',
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
