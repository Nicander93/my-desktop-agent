# DWB v1 文件索引

Desktop Workload Benchmark 设计稿。**36 个 Golden Tasks 已落地**，可跑任务在 `benchmarks/tasks/<ID>/`。

| 文件 | 内容 |
|------|------|
| `00-overview.md` | 定位、领域、难度、Wave 设计 |
| `01-golden-tasks.md` | 36 个任务卡（目标 / fixture / Hard check） |
| `02-task-and-verifier-spec.md` | Task / Fixture / Hidden / Verifier 约定（已按仓库实现修订） |
| `03-implementation-roadmap.md` | 落地状态与剩余工作 |
| `04-task-catalog.yaml` | 机器可读任务目录 |
| `05-coding-agent-prompt.md` | 维护 / 补洞提示（非从零实现） |

## 怎么跑

```bash
pnpm eval:dwb -- --model <model> --base-url <url>
pnpm eval -- --task benchmarks/tasks/DP-001/task.json --model <model> --base-url <url>
```

任务表与目录约定：[`benchmarks/README.md`](../../benchmarks/README.md)。评测入口：[`docs/eval/README.md`](../README.md)。

设计卡与磁盘实现不一致时，**以 `benchmarks/tasks/<ID>/` 与代码为准**，再回写本目录说明偏差。
