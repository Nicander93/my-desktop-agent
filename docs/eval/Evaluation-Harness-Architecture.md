# Evaluation Harness 目录

2026-07 起，旧的 `evals/coding/` 已去掉。

| 东西 | 位置 |
|------|------|
| runner / CLI / verifier | `packages/agent-eval` |
| 任务和 fixture | `benchmarks/tasks/` |
| DWB 隐藏输入 | `benchmarks/hidden-fixtures/<task-id>/` |
| 类型 | `packages/shared/src/types/evaluation.ts` |
| 旁路元数据 | 任务目录 `metadata.yaml`（可选） |
| 跑出来的 trace、diff、result | `eval-results/`（gitignore） |
| 设计稿 | `docs/eval/`、`docs/eval/dwb/` |

真正跑 Agent 还是 `agent-runtime` → `open-agent-sdk`。`agent-eval` 只负责隔离目录、超时和判分，不进 Electron。

```
packages/agent-eval/
packages/agent-runtime/
packages/open-agent-sdk/
packages/shared/
benchmarks/tasks/
benchmarks/hidden-fixtures/
eval-results/          # 不入库
docs/eval/
docs/eval/dwb/
```

一次 run 大概长这样：

```
eval-results/<task-id>/<runId>/
  workspace/
  baseline/
  trace.json
  diff.patch
  result.json
```

DWB 任务常见布局：

```
benchmarks/tasks/<ID>/
  task.json
  metadata.yaml
  fixture/
  harness/verify.mjs    # 判分，可不进 Agent workspace（resolveArgsFromTaskDir）
  reference/
  faults/
```

## 谁干什么

- `benchmarks/tasks`：prompt、verifier、limits、DWB harness
- `agent-eval`：拷 fixture、调 Runtime、写 diff、跑 Verifier、注入 `DWB_HIDDEN_ROOT`、落 result
- `eval-results`：现场，方便复盘

## 常用命令

```bash
pnpm eval:dwb -- --model <m> --base-url <url>
pnpm eval:report -- --group-by domain,difficulty
```

## 注意

- 分只认 Verifier
- 别把 API key 写进 fixture
- 超时后 cancel 与收证的竞态还在，见 [archive/Code-Review-v0-v1.md](./archive/Code-Review-v0-v1.md)

后续计划见 [Evaluation-Roadmap-v2.md](./Evaluation-Roadmap-v2.md)；历史愿景见 [archive/](./archive/)。
