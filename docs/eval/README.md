# 评测文档

| 文件 | 看什么 |
|------|--------|
| [Evaluation-Harness-Architecture.md](./Evaluation-Harness-Architecture.md) | 现在代码落在哪 |
| [Desktop-Agent-Evaluation-PRD.md](./Desktop-Agent-Evaluation-PRD.md) | 早期目标和阶段 |
| [Evaluation-Roadmap-v2.md](./Evaluation-Roadmap-v2.md) | 后面要做的 M2–M5 |
| [local-model-baseline.md](./local-model-baseline.md) | 本地模型跑过的记录 |
| [Code-Review-v0-v1.md](./Code-Review-v0-v1.md) | 旧 harness review，当历史看 |

怎么跑任务：`benchmarks/README.md`，或 `docs/developer-guide.md` §8。

根目录不要再加 `evals/`；runner 在 `packages/agent-eval`，任务在 `benchmarks/tasks`。
