# Runtime 优化计划

基于 2026-07-29 串行全量评测（`ornith-1.0-9b`，`maxAttempts=5`）的结果与失败分析。本文档记录 **尚未实施** 的 runtime / SDK 层优化项，供后续迭代参考。

## 已实施（本次）

| 项 | 位置 | 说明 |
|----|------|------|
| 可恢复重试 | `packages/agent-eval/src/runner.ts` | verifier 失败、error（含 API 500、max_turns）、timeout 均消耗 attempt 并重试 |
| 丰富反馈 | `runner.ts` `buildAttemptRetryFeedback` | 分 execution error / verification checks，command 类附 harness stderr |
| API 退避 | `agent-runtime` + SDK | `RuntimeOptions.apiRetry` 透传；SDK `withRetry` 用于单次 LLM 请求 |
| office-pptx turns | `profiles.ts`、`resolver.ts`、相关 task.json | profile 默认 8 → 50；OA/CW/office-ai-ppt 任务同步提升 |

## P1 — 工具与结果处理

### 1.1 提高 `maxSameToolRetries`

**现象**：officecli batch 等场景，模型重复同类失败调用后被 `engine.ts` 阻断（默认 2 次）。

**改动**：
- `packages/open-agent-sdk/src/engine.ts` — 读取 `resolvedPolicy.execution.maxSameToolRetries`
- `packages/agent-runtime/src/policies/resolver.ts` — office / office-pptx profile 默认提到 4–5

**预期收益**：减少 OA/CW 类任务中途被工具层硬阻断。

### 1.2 放宽 office 工具结果截断

**现象**：`office-pptx` 的 `maxToolResultChars=4000`，officecli 错误输出可能被截断，模型看不到完整 stderr。

**改动**：
- `profiles.ts` `toolResultPolicy.maxChars`：4000 → 8000
- `resolver.ts` `PROFILE_DEFAULTS['office-pptx'].maxToolResultChars` 同步

**预期收益**：减少「看不到错误细节 → 盲目重试」的循环。

### 1.3 接线 `maxInvalidToolRetries`

**现象**：`resolver.ts` 已定义 `maxInvalidToolRetries`，SDK `engine.ts` 未消费。

**改动**：在 `executeSingleTool` 中对无效 tool name / schema 错误单独计数，与 `maxSameToolRetries` 区分。

## P2 — 执行循环

### 2.1 修复超时 cancel 竞态

**现象**：`withTimeout` 触发 cancel 后不等待 agent 收尾就 diff/verify，workspace 状态可能不一致。

**改动**：
- `runner.ts` `withTimeout` — cancel 后 await 完成或设 grace period
- 参考 `docs/eval/archive/Code-Review-v0-v1.md`

### 2.2 总 turn 预算上限

**现象**：理论最大 `maxAttempts × maxTurns`（如 5×50=250），成本与时长不可控。

**改动**：
- `task.json` 可选 `limits.maxTotalTurns`
- `runner.ts` 跨 attempt 累计 turn 数，达上限后停止

### 2.3 `end_turn` 早退

**现象**：`engine.ts` 在单 turn 内若 `stopReason === 'end_turn'` 即 break，无法在同一 turn 继续工具链。

**评估**：是否对小模型放宽（允许多段 tool_use），需权衡延迟与正确率。

## P3 — Profile / Capability

### 3.1 `file-organizing` 工具不足

**现象**：FM 域通过率偏低；profile 仅 Read/Glob/Grep，无法写文件或跑 Bash。

**改动**：
- 扩展 `file-organizing` 默认工具：+ Write, Bash
- 或 FM 任务改用 `general` + 显式 capabilities

### 3.2 媒体处理 capability

**现象**：MP 域 0/3；无专用工具或 prompt 模板。

**改动**：
- 新增 `inspect-media` / `transform-media` capability
- 或在 MP task prompt 中嵌入 ffmpeg / ImageMagick 命令模板（任务层，非 runtime）

### 3.3 office profile 不继承 capability 工具

**现象**：`runtime.ts` 中 office profile 的 `allowedTools` 优先，capabilities 不扩展工具列表。

**评估**：cross-application 任务若需 TodoWrite，需在 task profile 或 policy 层显式放开。

## P4 — 并发与基础设施

### 4.1 本地模型并发指南

**结论**（已验证）：`ornith-1.0-9b` + `127.0.0.1:1234` 建议 `concurrency=1`，最多 2。

**改动**：
- `benchmarks/README.md` / `agent-eval README` 补充本地模型并发建议
- CLI 在检测到 `baseURL` 为 localhost 时 warn（可选）

### 4.2 SDK 层 API 重试

**状态**：基础能力已落地——`RuntimeOptions.apiRetry` → `AgentOptions.apiRetry` → `QueryEngine.withRetry`。

**后续**：
- Electron 设置页暴露 retry 配置（可选）
- 本地模型场景可提高 `maxRetries`（如 5）
- eval runner 不再重复 API attempt 重试

## P5 — 可观测性

### 5.1 Attempt 级 trace

**现象**：`result.json` 仅保留最后一次 `trace.json`，前几次 attempt 丢失。

**改动**：`trace-attempt-N.json` 或在 `attempts[]` 中附 `tracePath`。

### 5.2 报告按 domain 分组

**现象**：`--group-by domain,difficulty` 在 Windows 下逗号可能被 shell 拆成两个参数。

**改动**：`report-cli.ts` 支持 `--group-by domain,difficulty` 单参数或重复 flag。

## 建议实施顺序

```
P1.1 maxSameToolRetries
  → P1.2 工具结果截断
  → P2.1 超时竞态
  → P4.2 SDK API 重试
  → P3.1 file-organizing
  → P2.2 总 turn 上限
  → P5.x 可观测性
```

## 不在此计划内

- **Eval 专用 verify 自检 prompt**：真实业务无 harness，不应为通过率硬编码。
- **换模型**：效果显著但属基础设施决策，非 runtime 代码范畴。

## 验收方式

每项改动后跑：

```bash
# 串行全量（本地模型）
pnpm eval -- --all --output eval-results/_serial-check

# 或按域抽样
pnpm eval -- --tag dwb --task-id CW-002,OA-002,MP-001
pnpm eval:report -- --since <ISO> --group-by domain,difficulty
```

关注指标：通过率、error 中 API 500 / max_turns 占比、中位 attempt 数。
