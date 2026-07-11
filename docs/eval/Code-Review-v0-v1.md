# v0/v1 Evaluation Harness Code Review

审查日期：2026-07-11
审查范围：当前未提交的评估 harness、任务集、根级 workspace / 质量门禁配置改动。

## 结论

评估基础设施、首批任务集和质量门禁接入整体方向合理：任务使用独立 fixture，结果可保存，且不会直接修改主仓库工作区。当前有 4 个应在合并前处理的问题，其中 1 个涉及 API 密钥泄露风险。

## Findings

### P1：`.env` 中的密钥可能泄露给 Agent 工具调用

位置：[model-presets.ts](../../evals/coding/model-presets.ts#L22)

`loadProjectEnv()` 将根目录 `.env` 的所有值写入 `process.env`。评估运行的 Agent 允许 Bash 工具，而 SDK 的 Bash 工具会继承该环境变量。若任务 fixture、项目指令文件或模型行为触发 `env` / `Get-ChildItem Env:`，`CODEANY_API_KEY` 等敏感值会出现在工具输出、trace 和后续模型请求中。

建议：将 `.env` 解析为局部配置对象，只将 API key 传给 `RuntimeOptions`；不要写入全局 `process.env`。同时为 Agent 子进程建立白名单环境，明确排除 API key、token 和其他认证变量。

### P2：任务声明的 `maxTurns` 没有真正限制 Agent

位置：[runner.ts](../../evals/coding/runner.ts#L38)

每个任务可以设置 `limits.maxTurns`，但 `RuntimeAgentExecutor.execute()` 只传了 `profile: 'coding'`。实际 turn 上限来自 runner 初始化时的 model preset，通常是 30；例如 smoke 任务配置的 8 turns 不会生效。这会破坏成本控制和跨运行可比性。

建议：将 `input.task.limits?.maxTurns` 传入每次 prompt 的 AgentOptions override，或为每个任务使用合并该上限后的独立 Runtime。

### P2：超时结果与 workspace 取证存在竞态

位置：[runner.ts](../../evals/coding/runner.ts#L119)

超时后使用 `void options.executor.cancel?.(sessionId)` 发起取消，但不等待取消完成，接着马上计算文件 diff、运行 checks 并写报告。Agent 可能仍在写入 workspace，导致报告中的文件列表、diff、checker 结果和事件流互相不一致。

建议：等待取消完成，并等待执行 Promise 结束；若需要防止取消本身卡住，可设置短的取消宽限期，再开始收集 workspace 现场。

### P2：命令 checker 的超时不能杀掉子进程树

位置：[checkers.ts](../../evals/coding/checkers.ts#L117)

Windows 上 `child.kill()` 只结束直接启动的进程。任务的验证命令若使用 `pnpm`、`npm` 或脚本再启动子进程，超时后这些后代可能继续运行、占用文件或影响后续任务。

建议：按平台终止完整进程树；Windows 可使用 `taskkill /PID <pid> /T /F`，其他平台可用独立进程组并终止进程组。

## 已验证的正向点

- 任务定义、fixture 和预期快照均位于 `evals/coding/`，运行时会复制到独立 workspace。
- 首批任务集包含 3 个 smoke 任务和 3 个 regression 任务；每题初始 verifier 都应失败，避免空操作得分。
- v1 checker 覆盖 `file-exists`、`file-contains`、`command` 与 `snapshot`。
- 路径检查阻止 checker 访问 workspace / task 根目录之外的路径。
- 已接入根级 typecheck、Vitest、Knip 与 dependency-cruiser 门禁。

## 建议的合并顺序

1. 先修复 P1，避免真实模型运行时暴露认证信息。
2. 修复 timeout 和 turn 上限问题，保证单次 run 的边界可控、报告可信。
3. 修复命令进程树清理，再将 smoke suite 接入日常回归。
4. 修复后至少运行：

   ```powershell
   pnpm check
   pnpm eval:coding -- --suite smoke --validate-config
   ```

5. 经过额度确认后，执行一次真实 smoke run 并人工检查生成的 `report.md`、`events.jsonl` 与 `diff.patch`。
