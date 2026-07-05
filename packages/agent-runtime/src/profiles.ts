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

export interface RuntimeProfilePolicy {
  profile: RuntimeProfile;
  maxTurns?: number;
  thinking?: RuntimeOptions['thinking'];
  allowedTools?: string[];
  disallowedTools?: string[];
  appendSystemPrompt?: string;
  toolResultPolicy?: ToolResultPolicy;
}

const OFFICE_KEYWORDS = [
  'officecli',
  'ppt',
  'pptx',
  'powerpoint',
  '演示文稿',
  '幻灯片',
  'word',
  'docx',
  'excel',
  'xlsx',
  '表格',
];

const CODING_KEYWORDS = [
  // 命中后走 workspace 依赖策略，允许项目内 npm install
  'bug',
  'fix',
  'refactor',
  'test',
  'unit test',
  'npm',
  'pnpm',
  'yarn',
  'compile',
  'build',
  'debug',
  '测试',
  '重构',
  '修复',
  '单元测试',
];

export const OFFICE_FAST_PATH_PROMPT = [
  '你正在处理 Office 文档任务（Desktop Agent）。以下 Agent 执行约束 **优先于** officecli 官方 load_skill / 交互式 shell 文档中的 open、save、Quick Start。',
  '',
  '## 执行约束',
  '1. 禁止 Bash 执行：officecli open、close、save、watch、load_skill（会阻塞或灌入错误流程）。',
  '2. 禁止 officecli batch "batch.json" --json（缺少目标 .pptx/.docx 路径）。',
  '3. 标准路径：Write batch.json → officecli batch "目标.pptx" --input "batch.json" --json → 一次 validate/outline。',
  '4. batch 单独运行已内含 open/save；不要 create 后再 open，不要 open 后再 batch。',
  '5. help 只查当前缺的一条：officecli help pptx shape；禁止 help ... --json 拉完整 schema。',
  '6. 失败只看前 5 条错误做最小修补；无错误不重写整份 batch。',
  '7. 保持工具调用少；不要重复 help / validate / load_skill。',
  '',
  '## PPTX 格式与 batch 参考',
  getSkillPromptBody(OFFICECLI_PPTX_AGENT_SKILL),
].join('\n');

export function inferRuntimeProfile(content: string, explicit?: RuntimeProfile): RuntimeProfile {
  if (explicit) return explicit;

  const lower = content.toLowerCase();
  if (OFFICE_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return 'office';
  }

  if (CODING_KEYWORDS.some((keyword) => lower.includes(keyword.toLowerCase()))) {
    return 'coding';
  }

  return 'general';
}

export function getRuntimeProfilePolicy(profile?: RuntimeProfile): RuntimeProfilePolicy | undefined {
  if (profile !== 'office') return undefined;

  return {
    profile: 'office',
    maxTurns: 8,
    thinking: { type: 'disabled' },
    allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
    appendSystemPrompt: OFFICE_FAST_PATH_PROMPT,
    toolResultPolicy: {
      maxChars: 4000,
      summarizeJson: true,
      preserveHeadTail: true,
    },
  };
}

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
