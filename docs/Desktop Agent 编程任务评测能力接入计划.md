# Desktop Agent 编程任务评测能力接入计划

## 1. 目标

为 Desktop Agent 增加一套可重复运行、可对比、可定位问题的编程任务评测能力，用于持续发现 Agent 在真实编程任务中的短板，并为后续 runtime、prompt、tool、UI、trace、provider 策略优化提供依据。

评测系统不以“跑分”为第一目标，而以“定位问题”为第一目标。

最终应能回答以下问题：

1. 当前 Agent 是否能稳定完成常见编程任务？
2. 失败发生在哪个阶段：理解、搜索、编辑、执行命令、验证、路径权限、上下文管理、工具结果处理、模型能力？
3. 不同 provider / model 下，失败差异是什么？
4. Runtime 改动后，是否引入回归？
5. 是否能通过 trace 快速复盘一次失败任务？

---

## 2. 当前仓库背景

当前项目是 Electron + React + Agent SDK monorepo，主要分层如下：

```text
Contract   packages/shared
L0 Engine  packages/open-agent-sdk
L1 Runtime packages/agent-runtime
L2 Host    apps/electron
L3 Bridge  preload + electron.d.ts
L4 UI      apps/renderer
```

评测能力应优先接入到 `packages/agent-runtime` 周边，不直接依赖 Electron UI。
原因：编程任务评测需要 headless、可批量、可重复运行，不能依赖人工点击 UI。

当前已有基础能力：

```text
pnpm test
pnpm typecheck
pnpm lint
pnpm dep-check
pnpm knip
pnpm check
```

评测系统应复用这些命令作为验证手段。

---

## 3. 设计原则

### 3.1 先测 Desktop Agent，不先测 benchmark

第一阶段先建设自己的场景任务集，不直接接入 SWE-bench / Terminal-Bench 等公开 benchmark。

原因：

```text
公开 benchmark 更容易测到“模型 + 环境 + benchmark harness”的综合能力；
当前阶段更需要发现 Desktop Agent Runtime 本身的问题。
```

### 3.2 评测分三层

```text
Smoke Eval       低成本模型 / 本地模型，用于验证 runtime、工具链、路径、trace 是否跑通
Regression Eval 便宜但稳定的云模型，用于每次改动后的回归测试
Quality Eval    强模型，用于评估真实编程任务完成能力
```

低成本模型不能直接代表产品能力。
本地模型 / 免费模型失败时，不能直接判定 runtime 有问题。

### 3.3 每个失败都必须可复盘

一次 eval run 至少保存：

```text
输入 prompt
使用的 model profile
workspace 路径
起始 commit / ref
最终 diff
工具调用记录
命令执行结果
验证命令结果
trace run
失败分类
耗时
turn 数
tool call 数
```

---

## 4. 推荐目录结构

新增目录：

```text
evals/
  coding/
    README.md
    model-presets.ts
    task-schema.ts
    run-coding-eval.ts
    report.ts
    classify-failure.ts
    tasks/
      smoke/
        coding-smoke-001.json
        coding-smoke-002.json
      regression/
        coding-regression-001.json
      quality/
        coding-quality-001.json
    reports/
      .gitkeep
```

可选后续目录：

```text
evals/
  fixtures/
    repos/
    workspaces/
  baselines/
    codex-cli/
    claude-code/
    opencode/
```

---

## 5. package.json 脚本

在根 `package.json` 增加：

```json
{
  "scripts": {
    "eval:coding": "tsx evals/coding/run-coding-eval.ts",
    "eval:coding:smoke": "tsx evals/coding/run-coding-eval.ts --suite smoke",
    "eval:coding:regression": "tsx evals/coding/run-coding-eval.ts --suite regression",
    "eval:coding:quality": "tsx evals/coding/run-coding-eval.ts --suite quality"
  }
}
```

目标使用方式：

```bash
pnpm eval:coding --suite smoke --model ollama-local
pnpm eval:coding --suite regression --model openrouter-cheap
pnpm eval:coding --suite quality --model frontier-quality

pnpm eval:coding --task coding-smoke-001 --model ollama-local
pnpm eval:coding --task coding-regression-001 --model openrouter-cheap
```

---

## 6. Model Preset 设计

新增文件：

```text
evals/coding/model-presets.ts
```

示例结构：

```ts
export type EvalUse = 'smoke' | 'regression' | 'quality';

export type EvalModelProvider =
  | 'openrouter'
  | 'ollama'
  | 'openai'
  | 'anthropic'
  | 'custom';

export type EvalModelProfile = {
  id: string;
  provider: EvalModelProvider;
  apiType: 'openai-completions' | 'anthropic-messages';
  baseURL?: string;
  apiKeyEnv?: string;
  model: string;

  costTier: 'free' | 'local' | 'cheap' | 'standard' | 'frontier';

  evalUse: EvalUse[];

  capabilities: {
    toolCalling: boolean;
    streaming: boolean;
    longContext: boolean;
    stableJson: boolean;
    reasoning: boolean;
  };

  runtimeDefaults?: {
    maxTurns?: number;
    thinking?: {
      type: 'adaptive' | 'enabled' | 'disabled';
      budgetTokens?: number;
    };
    promptCache?: {
      enabled: boolean;
      ttl?: string;
    };
  };
};

export const EVAL_MODEL_PRESETS: Record<string, EvalModelProfile> = {
  'ollama-local': {
    id: 'ollama-local',
    provider: 'ollama',
    apiType: 'openai-completions',
    baseURL: 'http://localhost:11434/v1',
    apiKeyEnv: 'OLLAMA_API_KEY',
    model: process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b',
    costTier: 'local',
    evalUse: ['smoke'],
    capabilities: {
      toolCalling: true,
      streaming: true,
      longContext: false,
      stableJson: false,
      reasoning: false
    },
    runtimeDefaults: {
      maxTurns: 20,
      thinking: { type: 'disabled' }
    }
  },

  'openrouter-free': {
    id: 'openrouter-free',
    provider: 'openrouter',
    apiType: 'openai-completions',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    model: process.env.OPENROUTER_FREE_MODEL || '<fill-openrouter-free-model-slug>',
    costTier: 'free',
    evalUse: ['smoke'],
    capabilities: {
      toolCalling: false,
      streaming: true,
      longContext: false,
      stableJson: false,
      reasoning: false
    },
    runtimeDefaults: {
      maxTurns: 15,
      thinking: { type: 'disabled' }
    }
  },

  'openrouter-cheap': {
    id: 'openrouter-cheap',
    provider: 'openrouter',
    apiType: 'openai-completions',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    model: process.env.OPENROUTER_CHEAP_MODEL || '<fill-openrouter-cheap-model-slug>',
    costTier: 'cheap',
    evalUse: ['smoke', 'regression'],
    capabilities: {
      toolCalling: true,
      streaming: true,
      longContext: true,
      stableJson: true,
      reasoning: false
    },
    runtimeDefaults: {
      maxTurns: 30,
      thinking: { type: 'disabled' }
    }
  },

  'frontier-quality': {
    id: 'frontier-quality',
    provider: 'openrouter',
    apiType: 'openai-completions',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    model: process.env.FRONTIER_QUALITY_MODEL || '<fill-frontier-model-slug>',
    costTier: 'frontier',
    evalUse: ['quality'],
    capabilities: {
      toolCalling: true,
      streaming: true,
      longContext: true,
      stableJson: true,
      reasoning: true
    },
    runtimeDefaults: {
      maxTurns: 50,
      thinking: { type: 'adaptive' }
    }
  }
};
```

注意：

1. 具体模型 slug 不要硬编码到核心逻辑里。
2. 免费模型只用于 smoke，不作为稳定回归基准。
3. 本地模型失败不能直接判定 runtime 失败。
4. 所有报告必须记录 provider、model、baseURL、capability、costTier。

---

## 7. Task Schema 设计

新增文件：

```text
evals/coding/task-schema.ts
```

建议 schema：

```ts
export type CodingEvalSuite = 'smoke' | 'regression' | 'quality';

export type CodingEvalTask = {
  id: string;
  title: string;
  suite: CodingEvalSuite;

  description: string;

  workspace: {
    type: 'current-repo' | 'fixture-repo' | 'external-repo';
    sourcePath?: string;
    checkoutRef?: string;
    cleanBeforeRun?: boolean;
  };

  prompt: string;

  validation: {
    commands: string[];
    timeoutMs?: number;
    requiredFilesChanged?: string[];
    forbiddenFilesChanged?: string[];
    allowUntrackedFiles?: boolean;
  };

  limits: {
    maxTurns: number;
    timeoutMs: number;
    maxToolCalls?: number;
    maxChangedFiles?: number;
  };

  tags: string[];

  expectedFailureModes?: string[];
};
```

任务示例：

```json
{
  "id": "coding-smoke-001",
  "title": "读取项目说明并运行最小验证",
  "suite": "smoke",
  "description": "验证 Agent 能否在当前仓库中读取项目说明并运行最小质量检查。",
  "workspace": {
    "type": "current-repo",
    "cleanBeforeRun": false
  },
  "prompt": "请阅读 README.md、AGENTS.md 和 contributing/testing.md，然后运行最小验证命令。不要修改代码，只报告当前项目是否能通过基础检查。",
  "validation": {
    "commands": ["pnpm typecheck"],
    "timeoutMs": 300000,
    "allowUntrackedFiles": false
  },
  "limits": {
    "maxTurns": 10,
    "timeoutMs": 600000,
    "maxToolCalls": 20,
    "maxChangedFiles": 0
  },
  "tags": ["smoke", "no-edit", "typecheck"]
}
```

编程修复任务示例：

```json
{
  "id": "coding-regression-001",
  "title": "修复 TypeScript 类型错误",
  "suite": "regression",
  "description": "验证 Agent 能否根据 typecheck 错误进行小范围修复。",
  "workspace": {
    "type": "current-repo",
    "cleanBeforeRun": true
  },
  "prompt": "请运行 pnpm typecheck，定位并修复当前 TypeScript 类型错误。要求小范围修改，修改后重新运行 pnpm typecheck 验证。",
  "validation": {
    "commands": ["pnpm typecheck"],
    "timeoutMs": 300000,
    "allowUntrackedFiles": false
  },
  "limits": {
    "maxTurns": 30,
    "timeoutMs": 1200000,
    "maxToolCalls": 80,
    "maxChangedFiles": 5
  },
  "tags": ["regression", "typecheck", "fix"]
}
```

---

## 8. Eval Runner 设计

新增文件：

```text
evals/coding/run-coding-eval.ts
```

Runner 职责：

1. 解析 CLI 参数：

   ```text
   --suite smoke|regression|quality
   --task <task-id>
   --model <model-preset-id>
   --output <report-dir>
   --dry-run
   --keep-workspace
   ```

2. 加载 task：

   ```text
   evals/coding/tasks/<suite>/*.json
   ```

3. 加载 model preset：

   ```text
   evals/coding/model-presets.ts
   ```

4. 准备 workspace：

   * `current-repo`：直接使用当前仓库或复制到临时目录
   * `fixture-repo`：从 fixture 复制
   * `external-repo`：后续支持 clone / checkout

5. 创建 `AgentRuntime`：

   * `cwd` 指向 workspace
   * `model` 来自 model preset
   * `apiType` 来自 model preset
   * `baseURL` 来自 model preset
   * `apiKey` 从 `apiKeyEnv` 读取
   * `profile` 固定为 `coding`
   * `maxTurns` 使用 task 和 model preset 合并后的结果

6. 执行 prompt：

   * 使用 `sendMessage` 获取流式消息
   * 收集 assistant 输出
   * 收集 tool call 事件
   * 记录每个 turn 的时间

7. 执行验证命令：

   * 逐个运行 `validation.commands`
   * 捕获 stdout / stderr / exitCode
   * 超时后杀进程

8. 收集 git diff：

   ```bash
   git status --porcelain
   git diff --stat
   git diff
   ```

9. 收集 trace：

   * 调用 runtime 的 latest trace 能力
   * 保存为 `trace.json`
   * 生成简化版 `trace-summary.md`

10. 分类失败：

* 调用 `classifyFailure`
* 输出失败阶段和原因

11. 生成报告：

* `result.json`
* `summary.md`
* `diff.patch`
* `trace.json`
* `stdout.log`
* `stderr.log`

---

## 9. Report 格式

每次运行生成目录：

```text
evals/coding/reports/
  2026-07-08T213000/
    summary.md
    results.json
    tasks/
      coding-smoke-001/
        result.json
        summary.md
        diff.patch
        trace.json
        trace-summary.md
        validation.log
```

单任务 `result.json`：

```ts
export type CodingEvalResult = {
  taskId: string;
  suite: string;
  title: string;

  model: {
    presetId: string;
    provider: string;
    model: string;
    baseURL?: string;
    costTier: string;
    capabilities: Record<string, boolean>;
  };

  status: 'pass' | 'fail' | 'timeout' | 'error';

  metrics: {
    startedAt: string;
    endedAt: string;
    durationMs: number;
    turns: number;
    toolCalls: number;
    changedFiles: number;
    validationCommands: number;
    validationPassed: boolean;
  };

  validation: Array<{
    command: string;
    exitCode: number | null;
    durationMs: number;
    passed: boolean;
    stdoutPath: string;
    stderrPath: string;
  }>;

  git: {
    changedFiles: string[];
    diffStat: string;
    diffPath: string;
  };

  failure?: {
    phase:
      | 'task-understanding'
      | 'file-discovery'
      | 'tool-use'
      | 'edit'
      | 'command-execution'
      | 'validation'
      | 'path-permission'
      | 'context'
      | 'model-capability'
      | 'timeout'
      | 'unknown';
    reason: string;
    evidence: string[];
  };

  artifacts: {
    summaryPath: string;
    tracePath?: string;
    traceSummaryPath?: string;
    diffPath?: string;
  };
};
```

`summary.md` 示例：

```md
# Coding Eval Report

## Run

- Suite: smoke
- Model: ollama-local
- Started: 2026-07-08 21:30:00
- Duration: 8m 32s

## Result

| Task | Status | Duration | Turns | Tool Calls | Changed Files | Failure Phase |
|---|---|---:|---:|---:|---:|---|
| coding-smoke-001 | pass | 42s | 3 | 5 | 0 | - |
| coding-smoke-002 | fail | 2m 12s | 8 | 19 | 2 | validation |

## Findings

### Runtime 问题

- 无

### 模型能力问题

- coding-smoke-002 中，本地模型未正确理解 TypeScript 错误。

### 工具/环境问题

- 无

## Next Actions

1. 为 coding profile 增加更明确的验证策略。
2. smoke suite 增加一个“不能修改文件”的 guard case。
```

---

## 10. Failure Classification 设计

新增文件：

```text
evals/coding/classify-failure.ts
```

分类规则先用 deterministic rule，不要一开始让 LLM 判断。

建议规则：

```text
validation command failed
  => validation

no files changed but task requires fix
  => edit

changed forbidden files
  => edit

tool call count exceeded
  => tool-use

timeout before validation
  => timeout

permission denied / path access denied
  => path-permission

same command repeated more than 3 times
  => command-execution

agent stopped without running required validation
  => validation

model did not call tools in tool-required task
  => model-capability

trace missing or unreadable
  => runtime-trace
```

分类输出必须带 evidence，例如：

```json
{
  "phase": "validation",
  "reason": "pnpm typecheck failed after agent completed",
  "evidence": [
    "validation command exitCode=2",
    "stderr contains TypeScript error TS2322"
  ]
}
```

---

## 11. Coding Profile Policy

当前 `coding` profile 应有专门策略，不应继续走 general profile。

建议在：

```text
packages/agent-runtime/src/profiles.ts
```

新增：

```ts
const CODING_AGENT_PROMPT = [
  '你正在处理 Desktop Agent 的编程任务。',
  '',
  '## 执行原则',
  '1. 先阅读 README.md、AGENTS.md、contributing/architecture.md、contributing/testing.md，理解项目边界。',
  '2. 修改前先运行或读取与任务相关的最小验证命令。',
  '3. 优先小范围修改，不要重写无关文件。',
  '4. 不要修改与任务无关的 package、lockfile、配置文件。',
  '5. 修改后必须运行任务指定的验证命令。',
  '6. 如果验证失败，只根据错误做最小修复。',
  '7. 不要重复运行相同失败命令超过 2 次，除非中间有实质修改。',
  '8. 输出最终结果时说明修改内容、验证结果、仍存在的问题。',
].join('\n');
```

并让 `getRuntimeProfilePolicy('coding')` 返回：

```ts
{
  profile: 'coding',
  maxTurns: 30,
  thinking: { type: 'adaptive' },
  allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
  appendSystemPrompt: CODING_AGENT_PROMPT,
  toolResultPolicy: {
    maxChars: 8000,
    summarizeJson: true,
    preserveHeadTail: true
  }
}
```

注意：

1. 不要影响 `office` profile 的 fast path。
2. `coding` profile 应可被 eval runner 显式指定。
3. 后续可以根据 eval 失败报告不断迭代 prompt。

---

## 12. 第一批任务集

### 12.1 Smoke Suite

目标：低成本检查 runtime 能否跑通。

建议 5 个任务：

```text
coding-smoke-001 读取项目说明并运行 pnpm typecheck，不修改文件
coding-smoke-002 读取 AGENTS.md，并说明提交前应运行什么命令
coding-smoke-003 搜索 AgentRuntime 定义位置，并说明 sendMessage 流程，不修改文件
coding-smoke-004 创建一个临时 markdown 文件，再删除，验证 Write/Edit/Bash 可用
coding-smoke-005 运行 pnpm test，保存结果，不修改源码
```

### 12.2 Regression Suite

目标：每次 runtime 变更后检查是否退化。

建议 8～12 个任务：

```text
coding-regression-001 修复一个 TypeScript 类型错误
coding-regression-002 为 shared 纯函数补单测
coding-regression-003 修改 profile 推断逻辑并补测试
coding-regression-004 修改 trace 分组展示逻辑并补测试
coding-regression-005 新增一个 IPC 类型并保持分层规则
coding-regression-006 根据 lint 错误做最小修复
coding-regression-007 根据 dep-check/knip 输出清理无用依赖
coding-regression-008 修复一个 Vitest 失败用例
```

### 12.3 Quality Suite

目标：测真实编程能力。

建议 5～10 个任务：

```text
coding-quality-001 新增 coding profile policy，并补 profile tests
coding-quality-002 新增 model presets，并让 AgentRuntime 支持 provider preset
coding-quality-003 新增 eval runner 的最小可用版本
coding-quality-004 新增 trace summary 报告生成
coding-quality-005 新增失败分类逻辑并补单测
```

Quality Suite 可以直接驱动本评测系统自身建设。

---

## 13. 对比基线设计

后续可增加 baseline runner，对比：

```text
Desktop Agent
Codex CLI
Claude Code
opencode
OpenHands / SWE-agent
```

初期不实现自动集成，只预留报告字段：

```json
{
  "baseline": {
    "name": "desktop-agent",
    "version": "local",
    "command": "pnpm eval:coding ..."
  }
}
```

后续可增加：

```bash
pnpm eval:coding:baseline --runner codex-cli --task coding-regression-001
```

基线对比用于判断：

```text
所有 agent 都失败     => 任务过难或验证不合理
只有 Desktop Agent 失败 => runtime / tool / prompt 存在问题
只有弱模型失败       => 模型能力问题
强模型也工具乱用     => prompt / tool result / trace 策略问题
```

---

## 14. 多 Provider 策略

### 14.1 Smoke Eval

使用：

```text
ollama-local
openrouter-free
```

用途：

```text
检查 runtime、工具、workspace、trace、命令执行链路是否跑通
```

不用于产品能力结论。

### 14.2 Regression Eval

使用：

```text
openrouter-cheap
```

用途：

```text
每次改 runtime、profile、tool、trace 后执行
```

可作为趋势指标。

### 14.3 Quality Eval

使用：

```text
frontier-quality
```

用途：

```text
评估真实编程任务完成能力
```

只在关键版本或较大改动后执行，避免成本过高。

---

## 15. 成本控制

Runner 应支持：

```bash
--max-tasks 3
--task coding-smoke-001
--dry-run
--no-trace
--skip-validation
--stop-on-first-failure
```

建议默认策略：

```text
本地开发：pnpm eval:coding --suite smoke --model ollama-local
提交前：  pnpm eval:coding --suite smoke --model openrouter-cheap
大改后：  pnpm eval:coding --suite regression --model openrouter-cheap
版本前：  pnpm eval:coding --suite quality --model frontier-quality
```

---

## 16. 里程碑

### Milestone 1：最小可用评测框架

目标：能跑单个 task，输出报告。

任务：

```text
1. 新增 evals/coding 目录
2. 新增 task-schema.ts
3. 新增 model-presets.ts
4. 新增 run-coding-eval.ts
5. 新增 2 个 smoke task
6. package.json 增加 eval:coding 脚本
7. 输出 result.json、summary.md、diff.patch
```

验收：

```bash
pnpm eval:coding --task coding-smoke-001 --model ollama-local
```

通过标准：

```text
能启动 AgentRuntime
能指定 cwd
能读取 task
能调用模型
能执行验证命令
能生成报告
```

### Milestone 2：Trace 与失败分类

任务：

```text
1. 接入 getLatestTraceRun
2. 保存 trace.json
3. 生成 trace-summary.md
4. 新增 classify-failure.ts
5. 报告中显示 failure.phase / reason / evidence
```

验收：

```bash
pnpm eval:coding --suite smoke --model openrouter-cheap
```

通过标准：

```text
失败任务能明确标注失败阶段
报告里能看到最后若干 tool calls
```

### Milestone 3：Coding Profile Policy

任务：

```text
1. 在 profiles.ts 中增加 CODING_AGENT_PROMPT
2. getRuntimeProfilePolicy 支持 coding
3. 补充 profile policy 单测
4. eval runner 默认使用 profile=coding
```

验收：

```bash
pnpm test
pnpm eval:coding --suite smoke --model openrouter-cheap
```

通过标准：

```text
coding 任务走 coding policy
office profile 不受影响
```

### Milestone 4：Regression Suite

任务：

```text
1. 增加 8～12 个 regression task
2. 支持 suite 批量运行
3. 支持 stop-on-first-failure
4. summary.md 输出矩阵表
```

验收：

```bash
pnpm eval:coding --suite regression --model openrouter-cheap
```

通过标准：

```text
能批量执行
能汇总 pass/fail
能按 failure phase 聚合问题
```

### Milestone 5：Provider 对比报告

任务：

```text
1. 支持同一 task 多模型运行
2. 支持 --models a,b,c
3. summary.md 输出 provider/model 对比矩阵
```

目标命令：

```bash
pnpm eval:coding --task coding-regression-001 --models ollama-local,openrouter-cheap,frontier-quality
```

通过标准：

```text
报告能显示不同模型下的完成差异
```

---

## 17. 后续可选能力

### 17.1 自动升级模型

策略：

```text
便宜模型先运行 N turn
如果出现以下情况，升级到强模型：
1. N turn 后没有修改文件
2. 相同命令重复失败
3. 验证失败两次
4. tool call 超预算
5. 修改文件数异常
```

升级时传递：

```text
任务原始 prompt
已读文件摘要
已运行命令
失败输出
当前 diff
trace summary
```

### 17.2 接入公开 Benchmark

顺序建议：

```text
1. 先抽样 Terminal-Bench / Multi-SWE-bench
2. 只接 5～10 个任务
3. 验证 harness 能力
4. 再考虑批量跑
```

不要一开始接全量 benchmark。

### 17.3 UI 展示

后续可以在 Desktop Agent UI 中增加：

```text
Eval Runs 页面
Task 详情页
Trace Timeline
Diff Viewer
Failure Phase 统计
Provider 对比图
```

但第一阶段不做 UI，优先 headless runner。

---

## 18. 不做事项

第一阶段明确不做：

```text
1. 不接全量 SWE-bench
2. 不做复杂 Docker 沙箱
3. 不做 UI 可视化
4. 不做自动 PR
5. 不做 LLM-as-judge 评分
6. 不把免费模型结果作为核心能力分
```

---

## 19. 最终验收标准

评测能力初版完成后，应满足：

```bash
pnpm eval:coding --suite smoke --model ollama-local
pnpm eval:coding --suite smoke --model openrouter-cheap
pnpm eval:coding --task coding-regression-001 --model openrouter-cheap
```

并能生成：

```text
result.json
summary.md
diff.patch
trace.json
trace-summary.md
validation.log
```

报告中必须能看出：

```text
任务是否成功
失败阶段
失败证据
修改了哪些文件
运行了哪些验证命令
模型/provider 信息
工具调用数量
turn 数
耗时
下一步建议
```

---

## 20. 给后续 Agent 的执行提示

执行本计划时，请遵守：

```text
1. 先阅读 README.md、AGENTS.md、contributing/architecture.md、contributing/testing.md。
2. 不要破坏现有分层。
3. eval runner 优先放在 evals/coding，不要放进 renderer。
4. 不要让 eval 逻辑依赖 Electron UI。
5. Provider 差异收敛在 model-presets.ts，不要散落在 runtime 中。
6. 第一阶段只实现最小可用闭环，不追求功能完整。
7. 每完成一个 milestone，运行 pnpm check。
8. 所有新增 task 都必须能说明：测什么、如何判定成功、失败后如何定位。
```
