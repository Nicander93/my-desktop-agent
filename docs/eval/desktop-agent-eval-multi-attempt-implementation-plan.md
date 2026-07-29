# Desktop Agent 评测多轮尝试能力实施文档

> 仓库：`Nicander93/my-desktop-agent`  
> 基于分支：当前 `main`  
> 文档日期：2026-07-29  
> 目标读者：负责直接修改仓库代码的 Coding Agent

---

## 1. 背景

当前评测流程只允许 Agent 执行一次：

```text
准备 workspace
  → Agent 执行
  → Verifier 验证
  → 写入 result.json
  → 结束
```

这种方式适合衡量单次完成能力，但与真实桌面 Agent 的使用方式不完全一致。真实场景中，用户通常允许 Agent 在收到测试失败、文件缺失、输出格式不正确等反馈后继续修复。

本次改造的目标是：

```text
准备一次 workspace
  → 第 1 次执行
  → Verifier 验证
  → 未通过时，把失败检查反馈给同一个 Agent 会话
  → 在原 workspace 中继续修复
  → 最多执行 N 次
  → 以最后一次结果作为本次评测结果
```

本次只实现最小可用版本，不引入复杂的 Episode 状态机、恢复评分、错误相似度判断或自动优化逻辑。

---

## 2. 当前仓库实现依据

修改前先阅读并确认以下文件的当前实现，不要只根据本文档直接覆盖代码。

### 2.1 核心 Runner

文件：

```text
packages/agent-eval/src/runner.ts
```

当前职责：

1. 创建评测运行目录。
2. 把 fixture 复制为 baseline 和 workspace。
3. 创建一个 `sessionId`。
4. 调用一次 `AgentExecutor.execute()`。
5. 执行一次 `verifyTask()`。
6. 写入 trace、diff 和 result。
7. 根据 timeout、error 和 verifier 结果生成最终状态。

当前关键限制：

- `runTask()` 中 Agent 只执行一次。
- `RuntimeAgentExecutor.execute()` 每次创建一个 `AgentRuntime`。
- `execute()` 的 `finally` 会关闭 session，因此无法继续向同一 Agent 会话发送反馈。

### 2.2 Agent Runtime

文件：

```text
packages/agent-runtime/src/runtime.ts
```

当前 `AgentRuntime` 已经按 `sessionId` 缓存 Agent：

```ts
private agents: Map<string, Agent> = new Map();
```

同一个 `sessionId` 连续调用 `sendMessage()` 时，可以复用同一个 Agent 和会话上下文。因此本次不需要重写 Runtime，只需要避免 `RuntimeAgentExecutor` 在每次尝试后立即关闭它。

### 2.3 Verifier

文件：

```text
packages/agent-eval/src/verifier.ts
```

当前每个检查已经输出：

```ts
interface EvaluationCheck {
  id: string;
  passed: boolean;
  evidence: string;
  durationMs: number;
}
```

其中 `evidence` 已包含：

- 缺失文件；
- 保护文件被修改；
- 命令退出码；
- 命令 stderr；
- stdout 缺失内容；
- snapshot 不一致；
- 声明式检查失败信息。

本次直接使用失败检查的 `id + evidence` 构造下一轮反馈，不增加新的诊断模型。

### 2.4 评测契约

文件：

```text
packages/shared/src/types/evaluation.ts
```

当前主要类型：

```ts
EvaluationTask
EvaluationLimits
EvaluationVerification
EvaluationResult
EvaluationArtifacts
```

本次应通过增加可选字段保持兼容，不升级 `schemaVersion`，不要求迁移现有任务和历史结果。

### 2.5 CLI 中的 repeat

文件：

```text
packages/agent-eval/src/cli.ts
```

现有：

```bash
--repeat N
```

表示把一个任务从全新 workspace 开始独立运行 N 次，用于衡量稳定性。

本次新增的 `maxAttempts` 含义不同：

```text
repeat：
同一个任务独立运行多次，每次重新准备 workspace 和 session。

maxAttempts：
一次 run 内允许根据 Verifier 反馈继续修复，复用 workspace 和 session。
```

不要修改 `--repeat` 的现有语义。

---

## 3. 本次实施范围

### 3.1 必须实现

1. Task 支持可选的 `limits.maxAttempts`。
2. 默认 `maxAttempts = 1`，现有任务行为不变。
3. 第一次执行后运行 Verifier。
4. Verifier 通过时立即结束。
5. Verifier 未通过且仍有剩余尝试次数时：
   - 保留当前 workspace；
   - 保留同一 session；
   - 把失败检查反馈给 Agent；
   - 继续执行。
6. 达到最大尝试次数后仍未通过，最终状态为 `failed`。
7. 在结果中记录每次尝试。
8. 顶层 `status`、`verifier`、`error` 和 `failure` 表示最后一次有效尝试的结果。
9. 确保 session 在正常完成、异常和超时后都被关闭。
10. 添加自动化测试。

### 3.2 第一版明确不实现

- 重试次数扣分。
- Recovery Score。
- 相同错误检测。
- 无进展检测。
- 自动提前终止。
- 网络错误自动重试。
- Agent Runtime 异常自动重试。
- 超时后继续运行。
- 每次尝试单独保存完整 trace。
- 每次尝试单独保存 workspace 快照。
- 每次尝试单独保存 diff 文件。
- `--max-attempts` CLI 覆盖参数。
- `maxTotalTurns`。
- 自动修改 Prompt、Tools、Skills 或 Profile。

---

## 4. 目标执行语义

### 4.1 可以继续尝试的情况

仅当满足以下条件时继续：

```text
Agent 本轮执行正常结束
AND
Verifier 未通过
AND
当前 attempt < maxAttempts
```

### 4.2 不继续尝试的情况

以下情况第一版直接结束：

- Agent 执行抛出异常；
- Runtime 返回执行错误；
- 评测超时；
- 环境工具无法启动；
- Verifier 已通过；
- 已达到 `maxAttempts`。

原因：第一版评估的是“Agent 根据确定性任务反馈继续修复”的能力，不把网络、Provider、Runtime 或宿主环境故障混入恢复能力。

### 4.3 Workspace 和 Session

同一次 `runTask()` 内：

```text
workspacePath：始终相同
baselinePath：始终相同
sessionId：始终相同
```

不同 `--repeat` 运行之间：

```text
workspacePath：不同
sessionId：不同
runId：不同
```

---

## 5. 建议修改文件

| 文件 | 必须修改 | 主要内容 |
|---|---:|---|
| `packages/shared/src/types/evaluation.ts` | 是 | 增加 `maxAttempts`、`EvaluationAttempt`、结果字段 |
| `packages/shared/src/index.ts` | 是 | 导出 `EvaluationAttempt` 类型 |
| `packages/agent-eval/src/task.ts` | 是 | 校验 `limits.maxAttempts` |
| `packages/agent-eval/src/runner.ts` | 是 | session 复用、多轮循环、反馈构造、尝试记录 |
| `packages/agent-eval/src/*.test.ts` | 是 | 新增或补充 Runner 测试 |
| `benchmarks/README.md` | 建议 | 说明 `repeat` 与 `maxAttempts` 的区别 |
| `packages/agent-eval/src/report.ts` | 否 | 当前可直接兼容新增字段 |
| `packages/agent-eval/src/cli.ts` | 否 | 第一版不增加 CLI 参数 |
| `packages/agent-runtime/src/runtime.ts` | 否 | Runtime 已支持同 session 复用 |

实际修改前，先检查仓库是否已有对应测试文件，并遵循已有命名和组织方式。

---

## 6. 数据结构修改

### 6.1 EvaluationLimits

在：

```text
packages/shared/src/types/evaluation.ts
```

增加：

```ts
export interface EvaluationLimits {
  maxTurns?: number;
  timeoutMs?: number;
  maxChangedFiles?: number;

  /**
   * 同一次评测 run 中允许的最大 Agent 尝试次数。
   * 每次 Verifier 失败后可在同一 workspace、同一 session 中继续。
   * 默认值为 1。
   */
  maxAttempts?: number;
}
```

约束：

```text
必须是整数
必须 >= 1
未配置时视为 1
```

### 6.2 EvaluationAttempt

新增：

```ts
export interface EvaluationAttempt {
  index: number;
  status: 'passed' | 'failed' | 'error' | 'timeout';
  startedAt: string;
  endedAt: string;
  durationMs: number;
  verifier: EvaluationVerification;
  error?: string;
}
```

说明：

- `index` 从 1 开始。
- `status` 使用和顶层结果一致的状态集合。
- 每次尝试都应运行 Verifier，因此 `verifier` 保持必填。
- 即使 Agent 执行异常，也沿用当前行为，对 workspace 当前状态执行 Verifier，保留确定性证据。
- Attempt 第一版不保存独立 trace 路径和 diff 路径。

### 6.3 EvaluationResult

增加兼容字段：

```ts
export interface EvaluationResult {
  // 现有字段保持不变

  /**
   * 新结果总是写入；声明为可选以兼容历史 result.json。
   */
  attemptCount?: number;

  /**
   * 新结果总是写入；声明为可选以兼容历史 result.json。
   */
  attempts?: EvaluationAttempt[];
}
```

不要把 `schemaVersion` 改为 2。

新生成的结果必须始终包含：

```ts
attemptCount: attempts.length,
attempts,
```

历史结果没有这两个字段时，报告模块仍应正常读取。

### 6.4 Shared 导出

在：

```text
packages/shared/src/index.ts
```

当前 evaluation 类型导出列表中增加：

```ts
EvaluationAttempt
```

---

## 7. Task 配置与校验

### 7.1 示例配置

现有任务：

```json
{
  "limits": {
    "maxTurns": 32,
    "timeoutMs": 600000,
    "maxChangedFiles": 2
  }
}
```

支持调整为：

```json
{
  "limits": {
    "maxTurns": 32,
    "timeoutMs": 600000,
    "maxChangedFiles": 2,
    "maxAttempts": 3
  }
}
```

### 7.2 默认兼容

以下任务：

```json
{
  "limits": {
    "maxTurns": 32
  }
}
```

必须等价于：

```json
{
  "limits": {
    "maxTurns": 32,
    "maxAttempts": 1
  }
}
```

### 7.3 loadTask 校验

在：

```text
packages/agent-eval/src/task.ts
```

增加校验：

```ts
const maxAttempts = task.limits?.maxAttempts;

if (
  maxAttempts !== undefined &&
  (!Number.isInteger(maxAttempts) || maxAttempts < 1)
) {
  throw new Error(
    `${path}: task.limits.maxAttempts must be a positive integer.`,
  );
}
```

至少覆盖：

- `0`：拒绝；
- `-1`：拒绝；
- `1.5`：拒绝；
- 字符串：拒绝；
- `1`：接受；
- 未配置：接受。

---

## 8. AgentExecutor 接口调整

### 8.1 设计原则

不要让 Runner 直接操作 `AgentRuntime`。继续通过 `AgentExecutor` 抽象执行，便于测试和未来替换执行器。

建议保留现有 `execute()` 作为第一次执行入口，并增加明确的继续执行方法。

### 8.2 建议接口

在：

```text
packages/agent-eval/src/runner.ts
```

调整为：

```ts
export interface AgentExecutor {
  execute(
    task: EvaluationTask,
    workspacePath: string,
    sessionId: string,
    onProgress?: ProgressSink,
  ): Promise<AgentExecution>;

  continueExecution(
    task: EvaluationTask,
    workspacePath: string,
    sessionId: string,
    feedback: string,
    onProgress?: ProgressSink,
  ): Promise<AgentExecution>;

  close?(sessionId: string): Promise<void>;

  cancel?(sessionId: string): Promise<void>;
}
```

语义：

- `execute()`：构造并发送完整初始评测 Prompt。
- `continueExecution()`：向当前 session 发送 Verifier 反馈。
- `close()`：正常或异常结束时释放 session。
- `cancel()`：超时时中断正在执行的 Agent。

不要把第二次尝试重新调用成一个全新的初始任务。

---

## 9. RuntimeAgentExecutor 重构

### 9.1 当前问题

当前 `execute()` 中大致结构为：

```ts
const runtime = new AgentRuntime(...);
this.sessions.set(sessionId, runtime);

try {
  // sendMessage
} finally {
  this.sessions.delete(sessionId);
  await runtime.close(sessionId);
}
```

这会导致第一次执行完成后 session 已关闭。

### 9.2 目标结构

改为：

```text
execute()
  → 创建或注册 Runtime
  → 发送初始 Prompt
  → 不关闭

continueExecution()
  → 找到同一个 Runtime
  → 使用同一个 sessionId 发送反馈
  → 不关闭

runTask() finally
  → executor.close(sessionId)
```

### 9.3 建议私有方法

提取统一消息消费逻辑：

```ts
private async send(
  runtime: AgentRuntime,
  task: EvaluationTask,
  workspacePath: string,
  sessionId: string,
  message: string,
  onProgress?: ProgressSink,
): Promise<AgentExecution>
```

该方法负责：

1. 调用 `runtime.sendMessage()`。
2. 消费 stream。
3. 收集最后一条 assistant 文本。
4. 检查 result event 是否包含执行错误。
5. 获取当前累计 trace。
6. 返回 `AgentExecution`。

### 9.4 execute()

建议流程：

```ts
async execute(...): Promise<AgentExecution> {
  if (this.sessions.has(sessionId)) {
    throw new Error(`Evaluation session already exists: ${sessionId}`);
  }

  const runtime = new AgentRuntime({
    ...this.runtimeOptions,
    maxTurns: task.limits?.maxTurns ?? this.runtimeOptions.maxTurns,
    includeEnvironmentContext: false,
  });

  this.sessions.set(sessionId, runtime);

  const prompt = buildInitialEvaluationPrompt(task);

  return this.send(
    runtime,
    task,
    workspacePath,
    sessionId,
    prompt,
    onProgress,
  );
}
```

### 9.5 continueExecution()

建议流程：

```ts
async continueExecution(
  task,
  workspacePath,
  sessionId,
  feedback,
  onProgress,
): Promise<AgentExecution> {
  const runtime = this.sessions.get(sessionId);

  if (!runtime) {
    throw new Error(`Evaluation session not found: ${sessionId}`);
  }

  return this.send(
    runtime,
    task,
    workspacePath,
    sessionId,
    feedback,
    onProgress,
  );
}
```

### 9.6 close()

新增幂等关闭：

```ts
async close(sessionId: string): Promise<void> {
  const runtime = this.sessions.get(sessionId);

  if (!runtime) {
    return;
  }

  this.sessions.delete(sessionId);
  await runtime.close(sessionId);
}
```

### 9.7 cancel()

修正当前 cancel 后 Map 中可能残留 session 的问题：

```ts
async cancel(sessionId: string): Promise<void> {
  const runtime = this.sessions.get(sessionId);

  if (!runtime) {
    return;
  }

  try {
    await runtime.getAgent(sessionId)?.interrupt();
  } finally {
    this.sessions.delete(sessionId);
    await runtime.close(sessionId);
  }
}
```

`close()` 和 `cancel()` 都必须允许被重复调用，不应因为 session 已不存在而抛错。

---

## 10. Prompt 构造

### 10.1 初始 Prompt

把当前 `RuntimeAgentExecutor.execute()` 内的初始 Prompt 构造提取为函数：

```ts
function buildInitialEvaluationPrompt(task: EvaluationTask): string {
  return [
    'This is an isolated evaluation workspace. Work only inside the current working directory.',
    'Do not modify tests or package.json. Inspect the source and tests, make the smallest correct source change, and verify it.',
    'When this fixture uses pnpm, run its scripts as `pnpm --ignore-workspace <script>` so it stays isolated from the host repository.',
    task.prompt,
  ].join('\n\n');
}
```

除非现有代码已经发生变化，否则不要修改这段约束的语义。

### 10.2 重试反馈 Prompt

增加纯函数：

```ts
function buildRetryFeedback(
  attempt: number,
  maxAttempts: number,
  verification: EvaluationVerification,
): string {
  const failedChecks = verification.checks
    .filter((check) => !check.passed)
    .map((check) => `- ${check.id}: ${check.evidence}`)
    .join('\n');

  return [
    `The previous attempt did not pass verification.`,
    `You are continuing attempt ${attempt + 1} of ${maxAttempts}.`,
    'Continue in the current workspace and preserve correct existing work.',
    'Do not restart the task or recreate the project unless required.',
    '',
    'Failed verification checks:',
    failedChecks || '- Verification failed without detailed check evidence.',
    '',
    'Inspect the failures, make the smallest necessary corrections, and verify the result.',
  ].join('\n');
}
```

要求：

- 只反馈 `passed === false` 的检查。
- 保留完整 `evidence`，不要只写“测试失败”。
- 不添加主观修复建议。
- 不把参考答案、hidden fixture 或 expected snapshot 内容泄露给 Agent。
- 不要求 Agent 从头重做。
- 不把上一轮 assistant 文本重复塞入 Prompt；同一 session 已有历史上下文。

---

## 11. runTask() 多轮循环

### 11.1 总体结构

保持以下资源只初始化一次：

```ts
runId
runDirectory
workspacePath
baselinePath
resultPath
tracePath
diffPath
sessionId
```

Workspace 也只调用一次：

```ts
await prepareWorkspace(fixturePath, baselinePath, workspacePath);
```

### 11.2 建议辅助函数

提取当前 Verifier 后处理逻辑，避免循环内重复：

```ts
async function verifyWorkspace(
  task: LoadedEvaluationTask,
  workspacePath: string,
  baselinePath: string,
  diffPath: string,
): Promise<EvaluationVerification> {
  const changedFiles = await writeDiff(
    baselinePath,
    workspacePath,
    diffPath,
  );

  const verification = await verifyTask(
    task,
    workspacePath,
    baselinePath,
  );

  if (task.limits?.maxChangedFiles !== undefined) {
    verification.checks.push({
      id: 'changed-files-limit',
      passed: changedFiles <= task.limits.maxChangedFiles,
      evidence:
        `Changed ${changedFiles} files ` +
        `(maximum ${task.limits.maxChangedFiles}).`,
      durationMs: 0,
    });

    verification.passed = verification.checks.every(
      (check) => check.passed,
    );
  }

  return verification;
}
```

循环中每次可以覆盖同一个 `diff.patch`，最终文件表示最后一次 workspace 状态。

### 11.3 建议伪代码

```ts
const maxAttempts = task.limits?.maxAttempts ?? 1;
const attempts: EvaluationAttempt[] = [];

let latestExecution: AgentExecution | undefined;
let latestVerification: EvaluationVerification | undefined;
let latestError: string | undefined;
let latestTimedOut = false;

try {
  for (let attemptIndex = 1; attemptIndex <= maxAttempts; attemptIndex += 1) {
    const attemptStartedAt = new Date().toISOString();
    const attemptStarted = performance.now();

    let execution: AgentExecution | undefined;
    let error: string | undefined;
    let timedOut = false;

    try {
      execution = await withTimeout(
        () => {
          if (attemptIndex === 1) {
            return options.executor.execute(
              task,
              workspacePath,
              sessionId,
              log,
            );
          }

          const feedback = buildRetryFeedback(
            attemptIndex - 1,
            maxAttempts,
            latestVerification!,
          );

          return options.executor.continueExecution(
            task,
            workspacePath,
            sessionId,
            feedback,
            log,
          );
        },
        resolveRemainingTimeout(...),
        () => options.executor.cancel?.(sessionId),
      );
    } catch (cause) {
      timedOut = cause instanceof EvaluationTimeoutError;
      error = cause instanceof Error ? cause.message : String(cause);
    }

    const verification = await verifyWorkspace(
      task,
      workspacePath,
      baselinePath,
      diffPath,
    );

    const status =
      timedOut
        ? 'timeout'
        : error
          ? 'error'
          : verification.passed
            ? 'passed'
            : 'failed';

    attempts.push({
      index: attemptIndex,
      status,
      startedAt: attemptStartedAt,
      endedAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - attemptStarted),
      verifier: verification,
      ...(error ? { error } : {}),
    });

    latestExecution = execution ?? latestExecution;
    latestVerification = verification;
    latestError = error;
    latestTimedOut = timedOut;

    if (status === 'passed') {
      break;
    }

    if (status === 'error' || status === 'timeout') {
      break;
    }
  }
} finally {
  await options.executor.close?.(sessionId);
}
```

这只是结构示意。实现时应复用现有日志、错误分类和类型，不要机械复制导致逻辑重复。

### 11.4 最终 Result

最终结果：

```ts
const finalAttempt = attempts.at(-1)!;

const result: EvaluationResult = {
  schemaVersion: 1,
  runId,
  taskId: task.id,
  taskVersion: task.version,
  status: finalAttempt.status,
  startedAt,
  endedAt,
  durationMs: Math.round(performance.now() - started),
  requestedProfile: task.profile,
  capabilities: [...task.capabilities],
  model: options.model,
  verifier: finalAttempt.verifier,
  artifacts: {
    workspacePath,
    tracePath: latestExecution ? tracePath : undefined,
    diffPath,
    resultPath,
  },
  attemptCount: attempts.length,
  attempts,
  ...(latestError ? { error: latestError } : {}),
  failure: classifyFailure(
    latestTimedOut,
    latestError,
    latestExecution?.trace,
    finalAttempt.verifier.passed,
  ),
};
```

约束：

- 顶层 `verifier` 等于最后一次尝试的 Verifier。
- 顶层 `status` 等于最后一次尝试状态。
- 总 `durationMs` 表示整个 run 的耗时。
- Attempt 的 `durationMs` 表示该轮 Agent 执行加 Verifier 的耗时。
- `attemptCount === attempts.length`。
- 最终通过时 `failure` 应为 `undefined`。

---

## 12. Timeout 语义

### 12.1 不允许每次尝试重新获得完整 timeout

当前单次执行中：

```json
{
  "timeoutMs": 600000
}
```

代表一次评测最多允许约 10 分钟的 Agent 执行时间。

增加 `maxAttempts` 后，不应自动变成：

```text
3 attempts × 10 minutes = 30 minutes
```

建议保留 `timeoutMs` 为整个 run 的总预算。

### 12.2 剩余预算

在 run 开始时计算 deadline：

```ts
const timeoutMs = task.limits?.timeoutMs;
const deadline =
  timeoutMs === undefined
    ? undefined
    : performance.now() + timeoutMs;
```

每次 Agent 执行前：

```ts
function remainingTimeoutMs(
  deadline: number | undefined,
): number | undefined {
  if (deadline === undefined) {
    return undefined;
  }

  return Math.max(1, Math.round(deadline - performance.now()));
}
```

如果进入下一轮前剩余预算已经耗尽，应按 `timeout` 结束，不再调用 Agent。

不要为第一版增加 `attemptTimeoutMs`。

### 12.3 maxTurns 语义

`maxTurns` 继续作为每次 `sendMessage()` 的上限。因此理论最大轮数为：

```text
maxAttempts × maxTurns
```

这是本次功能带来的明确成本增长，应在 README 中说明。第一版不增加总 turns 上限。

---

## 13. Trace、Diff 和 Artifact

### 13.1 Trace

同一 Agent session 的 trace 通常是累计的。

第一版只写一次：

```text
trace.json
```

内容使用最后一次成功获得的累计 trace。

不要为每次尝试写：

```text
attempt-1-trace.json
attempt-2-trace.json
...
```

避免结果体积和实现复杂度快速增长。

### 13.2 Diff

每轮验证前调用 `writeDiff()`，允许覆盖同一个：

```text
diff.patch
```

最终 `diff.patch` 表示 Agent 最终 workspace 相对 baseline 的差异。

### 13.3 Result

`result.json` 增加：

```json
{
  "attemptCount": 2,
  "attempts": [
    {
      "index": 1,
      "status": "failed",
      "startedAt": "...",
      "endedAt": "...",
      "durationMs": 1000,
      "verifier": {
        "passed": false,
        "checks": []
      }
    },
    {
      "index": 2,
      "status": "passed",
      "startedAt": "...",
      "endedAt": "...",
      "durationMs": 800,
      "verifier": {
        "passed": true,
        "checks": []
      }
    }
  ]
}
```

---

## 14. Report 兼容性

当前：

```text
packages/agent-eval/src/report.ts
```

主要读取：

```ts
result.status
result.durationMs
result.taskId
result.failure
result.artifacts
```

新增可选字段不会破坏当前报告。

本 PR 不要求修改报告统计口径。以下指标留到后续：

- 平均尝试次数；
- 首次通过率；
- N 次内通过率；
- 按尝试次数统计；
- 恢复成功率。

如实现过程中发现 TypeScript 类型或测试要求必须修改报告，只做最小兼容调整，不扩展统计功能。

---

## 15. 日志要求

保留当前日志风格，并增加尝试信息。

建议：

```text
[eval] start coding-bugfix-basic@1.0.0 model=...
[eval] limits maxTurns=32 maxAttempts=3 timeoutMs=600000
[eval] attempt 1/3 agent running…
[verify] FAIL command:pnpm — ...
[eval] attempt 1/3 failed
[eval] attempt 2/3 continue with verifier feedback…
[verify] pass command:pnpm
[eval] attempt 2/3 passed
[eval] passed after 2 attempts in 12345ms → ...
```

要求：

- 不输出 hidden fixture 路径或内容给 Agent。
- 过程日志仍写入 stderr。
- `--quiet` 仍能关闭过程日志。
- 最终 JSON 输出格式保持不被日志污染。

---

## 16. 自动化测试

优先在：

```text
packages/agent-eval/src/
```

按照现有测试约定新增或补充测试文件，例如：

```text
runner.test.ts
task.test.ts
```

仓库的 Vitest 配置已支持 package 内 Node 环境测试。

### 16.1 默认只执行一次

任务不设置 `maxAttempts`：

```text
execute 调用 1 次
continueExecution 调用 0 次
attemptCount = 1
```

### 16.2 第一次失败，第二次通过

Fake Executor：

1. 第一次写入不正确结果。
2. Verifier 失败。
3. `continueExecution()` 收到失败检查。
4. 第二次修改当前 workspace 为正确结果。
5. Verifier 通过。

断言：

```text
同一个 sessionId
同一个 workspacePath
execute = 1 次
continueExecution = 1 次
status = passed
attemptCount = 2
attempts[0].status = failed
attempts[1].status = passed
```

### 16.3 第一次通过立即结束

配置 `maxAttempts = 3`，第一次通过。

断言：

```text
continueExecution = 0 次
attemptCount = 1
status = passed
```

### 16.4 达到最大次数仍失败

配置 `maxAttempts = 3`，三次均失败。

断言：

```text
execute = 1 次
continueExecution = 2 次
attemptCount = 3
status = failed
顶层 verifier = attempts[2].verifier
```

### 16.5 Feedback 只包含失败检查

Verifier 包含一个通过检查和两个失败检查。

断言 feedback：

- 包含两个失败检查的 `id` 和 `evidence`；
- 不包含通过检查；
- 包含继续当前 workspace 的约束；
- 不包含 expected 或 hidden fixture 内容。

### 16.6 maxChangedFiles 参与下一轮反馈

第一次超过 `maxChangedFiles`。

断言下一轮 feedback 包含：

```text
changed-files-limit
```

### 16.7 Agent Error 不继续

第一次 `execute()` 抛出异常。

断言：

```text
continueExecution = 0 次
status = error
attemptCount = 1
close 被调用
```

### 16.8 Timeout 不继续

第一次执行超时。

断言：

```text
cancel 被调用
continueExecution = 0 次
status = timeout
attemptCount = 1
最终资源被清理
```

### 16.9 close 始终执行

分别覆盖：

- 首次通过；
- 多轮后通过；
- 多轮后失败；
- Agent error；
- timeout；
- Verifier 抛出异常。

确保 session 不残留在 `RuntimeAgentExecutor.sessions`。

### 16.10 Task 校验

覆盖：

```text
maxAttempts 未配置：通过
maxAttempts = 1：通过
maxAttempts = 3：通过
maxAttempts = 0：拒绝
maxAttempts = -1：拒绝
maxAttempts = 1.5：拒绝
maxAttempts = "3"：拒绝
```

### 16.11 历史结果兼容

构造一个没有 `attemptCount` 和 `attempts` 的旧 `EvaluationResult`，确认：

```text
summarizeResults()
renderReport()
```

仍正常工作。

---

## 17. 验收标准

全部满足后才算完成。

### 17.1 功能验收

- [ ] `limits.maxAttempts` 未配置时，只执行一次。
- [ ] `maxAttempts = 1` 时与当前行为一致。
- [ ] 第一次 Verifier 失败后，可在原 workspace 中继续。
- [ ] 后续尝试复用同一个 sessionId。
- [ ] 后续尝试能收到完整失败检查 evidence。
- [ ] 任意一次通过后立即停止。
- [ ] 达到最大次数仍失败时返回 `failed`。
- [ ] Agent error 和 timeout 不进入下一次尝试。
- [ ] `--repeat` 行为完全不变。
- [ ] 最终 session 一定关闭。

### 17.2 数据验收

- [ ] 新结果包含 `attemptCount`。
- [ ] 新结果包含 `attempts`。
- [ ] `attemptCount === attempts.length`。
- [ ] 顶层 `status` 与最后一次尝试一致。
- [ ] 顶层 `verifier` 与最后一次尝试一致。
- [ ] 旧结果仍可生成报告。
- [ ] schemaVersion 仍为 1。

### 17.3 工程验收

至少运行：

```bash
pnpm typecheck
pnpm --filter @desktop-agent/agent-eval test
pnpm test
```

条件允许时运行：

```bash
pnpm check
```

如果全量检查存在与本次无关的历史失败，应明确列出：

```text
命令
失败位置
是否与本次改动相关
```

不要通过删除测试、降低断言或跳过检查来让 CI 通过。

---

## 18. README 更新建议

在：

```text
benchmarks/README.md
```

补充：

```md
## 独立重复与单次运行内继续修复

`--repeat N` 会把任务从全新 workspace 独立运行 N 次，用于统计稳定性。

`task.json` 中的 `limits.maxAttempts` 表示一次 run 内最多允许 Agent
根据 Verifier 反馈继续修复的次数。所有尝试共享同一个 workspace 和
session。

例如：

```json
{
  "limits": {
    "maxTurns": 32,
    "timeoutMs": 600000,
    "maxAttempts": 3
  }
}
```

若同时使用 `--repeat 5`，则会独立运行 5 次；每次 run 最多包含 3 次尝试。
```

不要把 `maxAttempts` 描述为 `repeat` 或普通网络重试。

---

## 19. 推荐实施顺序

按以下顺序执行，降低一次性改动风险。

### Step 1：契约

修改：

```text
packages/shared/src/types/evaluation.ts
packages/shared/src/index.ts
packages/agent-eval/src/task.ts
```

完成类型和校验测试。

### Step 2：Executor 生命周期

修改：

```text
packages/agent-eval/src/runner.ts
```

先实现：

```text
continueExecution()
close()
cancel() 清理
```

暂时保持 `runTask()` 单次执行，确认现有测试通过。

### Step 3：多轮循环

重构 `runTask()`：

```text
单次 execute
→ verifier
→ attempts 数组
→ 必要时 continueExecution
```

### Step 4：结果与日志

补充：

```text
attemptCount
attempts
attempt 日志
最终累计 trace
最终 diff
```

### Step 5：测试

完成本文档第 16 节测试场景。

### Step 6：文档

更新 `benchmarks/README.md`。

---

## 20. 风险与处理

### 20.1 Session 泄漏

风险：

- 移除 `execute()` 中的 finally 后，异常路径可能不再关闭 Runtime。

处理：

- `runTask()` 外层必须使用 `try/finally`。
- `close()` 必须幂等。
- `cancel()` 后必须从 sessions Map 删除。
- 增加资源清理测试。

### 20.2 Timeout 被放大

风险：

- 每次尝试都使用完整 timeout，导致总时间按尝试次数倍增。

处理：

- 使用整个 run 的 deadline 和 remaining timeout。

### 20.3 Trace 重复膨胀

风险：

- 每次尝试都把累计 trace 追加保存，产生重复内容。

处理：

- 只保存最后一次取得的累计 trace。

### 20.4 Verifier 反馈泄露答案

风险：

- snapshot 或 hidden fixture 的实际内容被拼入 feedback。

处理：

- 只使用 `EvaluationCheck.id` 和现有 `evidence`。
- 不读取 expected 文件内容构造 Prompt。
- 不把 hidden fixture 路径注入 Prompt。

### 20.5 Error 被误判为可恢复失败

风险：

- Provider、Runtime 或环境错误触发继续尝试，影响评测含义。

处理：

- 第一版只对正常执行后的 Verifier 失败进行继续。

### 20.6 maxChangedFiles 检查遗漏

风险：

- 当前该检查在 `verifyTask()` 之后由 Runner 动态追加。
- 如果反馈只使用原始 Verifier，Agent 看不到该失败。

处理：

- 构造 feedback 时使用追加完 `changed-files-limit` 后的最终 verification。

---

## 21. Coding Agent 执行约束

执行本任务时遵循：

1. 先阅读当前仓库文件，不假设本文档中的代码与最新分支完全一致。
2. 采用最小改动，不重构无关模块。
3. 不修改 Agent Runtime 的公共行为，除非有确切必要。
4. 不新增第三方依赖。
5. 不修改现有 benchmark 的任务目标和 Verifier 规则。
6. 不改变 `--repeat` 语义。
7. 不升级 evaluation schemaVersion。
8. 不删除或弱化现有测试。
9. 所有新分支逻辑必须有自动化测试。
10. 完成后输出：
    - 修改文件列表；
    - 核心设计说明；
    - 测试命令及结果；
    - 未解决问题；
    - 与本文档不同的实现决策及原因。

---

## 22. 最终期望示例

任务配置：

```json
{
  "schemaVersion": 1,
  "id": "coding-bugfix-basic",
  "version": "1.0.0",
  "title": "修复筛选逻辑",
  "prompt": "修复当前项目中的筛选逻辑错误。不要删除或修改测试。完成后运行测试和构建，确保全部通过。",
  "profile": "coding",
  "capabilities": [
    "read-project",
    "edit-code",
    "run-tests",
    "inspect-git-diff"
  ],
  "workflowId": "coding-change-verify",
  "fixture": "fixture",
  "verifier": {
    "requiredFiles": ["src/filter.js"],
    "unchangedPaths": ["test/filter.test.js", "package.json"],
    "commands": [
      {
        "command": "pnpm",
        "args": ["test"],
        "timeoutMs": 30000
      },
      {
        "command": "pnpm",
        "args": ["build"],
        "timeoutMs": 30000
      }
    ]
  },
  "limits": {
    "maxTurns": 32,
    "timeoutMs": 600000,
    "maxChangedFiles": 2,
    "maxAttempts": 3
  }
}
```

可能的执行过程：

```text
attempt 1:
  Agent 修改代码
  pnpm test 失败
  Verifier 返回失败 evidence

attempt 2:
  同一 Agent 会话读取 Verifier feedback
  在原 workspace 中修复
  pnpm test 和 pnpm build 均通过
  结束
```

结果摘要：

```json
{
  "status": "passed",
  "attemptCount": 2,
  "attempts": [
    {
      "index": 1,
      "status": "failed"
    },
    {
      "index": 2,
      "status": "passed"
    }
  ]
}
```

该实现完成后，评测体系能够同时衡量：

```text
首次完成能力
多次反馈内完成能力
失败后的基本修复能力
```

同时仍保持现有 Runner、Verifier、Result 和 CLI 结构，不引入过早的复杂架构。
