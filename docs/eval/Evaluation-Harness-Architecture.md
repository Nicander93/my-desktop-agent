# Evaluation Harness 目录

2026-07 起，旧的 `evals/coding/` 已去掉。

| 东西 | 位置 |
|------|------|
| runner / CLI / verifier | `packages/agent-eval` |
| 任务和 fixture | `benchmarks/tasks/` |
| 类型 | `packages/shared/src/types/evaluation.ts` |
| 跑出来的 trace、diff、result | `eval-results/`（gitignore） |
| 设计稿 | `docs/eval/` |

真正跑 Agent 还是 `agent-runtime` → `open-agent-sdk`。`agent-eval` 只负责隔离目录、超时和判分，不进 Electron。

```
packages/agent-eval/
packages/agent-runtime/
packages/open-agent-sdk/
packages/shared/
benchmarks/tasks/
eval-results/          # 不入库
docs/eval/
```

一次 run 大概长这样：

```
eval-results/<label>/<task-id>/<timestamp>/
  workspace/
  baseline/
  trace.json
  diff.patch
  result.json
```

## 谁干什么

- `benchmarks/tasks`：prompt、verifier、limits
- `agent-eval`：拷 fixture、调 Runtime、写 diff、跑 Verifier、落 result
- `eval-results`：现场，方便复盘

## 注意

- 分只认 Verifier
- 别把 API key 写进 fixture
- 超时后 cancel 与收证的竞态还在，见 `Code-Review-v0-v1.md`

产品目标见 [Desktop-Agent-Evaluation-PRD.md](./Desktop-Agent-Evaluation-PRD.md)，后续计划见 [Evaluation-Roadmap-v2.md](./Evaluation-Roadmap-v2.md)。
