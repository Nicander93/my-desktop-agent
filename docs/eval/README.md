# 评测文档

## 现行（怎么跑）

| 文档 | 看什么 |
|------|--------|
| [benchmarks/README.md](../../benchmarks/README.md) | 任务目录、coding / DWB 跑法 |
| [packages/agent-eval/README.md](../../packages/agent-eval/README.md) | 评测 CLI 一页说明 |
| [Evaluation-Harness-Architecture.md](./Evaluation-Harness-Architecture.md) | runner 落在哪、产物结构 |
| [Evaluation-Roadmap-v2.md](./Evaluation-Roadmap-v2.md) | 已完成与剩余债务 |

## 设计（DWB）

| 文档 | 看什么 |
|------|--------|
| [dwb/](./dwb/) | Desktop Workload Benchmark：36 Golden Tasks 设计卡与目录 |

## 归档（Historical）

| 文档 | 看什么 |
|------|--------|
| [archive/](./archive/) | 早期 PRD、旧 harness review、基线笔记、coding 接入计划 |

## 常用命令

```bash
pnpm eval -- --task benchmarks/tasks/coding-bugfix-basic/task.json --model <m> --base-url <url>
pnpm eval:dwb -- --model <m> --base-url <url>
pnpm eval -- --task-id DP-001 --model <m> --base-url <url>
pnpm eval:report -- --group-by domain,difficulty
```

开发者手册：[docs/developer-guide.md](../developer-guide.md) §8。

根目录不要再加 `evals/`；runner 在 `packages/agent-eval`，任务在 `benchmarks/tasks`，结果在 `eval-results/`。
