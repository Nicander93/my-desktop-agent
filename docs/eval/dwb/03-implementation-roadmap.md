# DWB v1：落地状态与剩余工作

## 已完成

相对原 PR1–PR10 计划：

| 项 | 状态 |
|----|------|
| PR1 metadata / 目录 / 聚合 | 已完成 |
| PR2–PR7 六个 Seed + Wave2/3 | **36 题均可跑** |
| PR8 `--repeat` / `--diagnose` / `eval:report --group-by` | 已完成 |
| 文档归位 `docs/eval/dwb/` | 已完成 |
| 旧 coding/office 任务兼容 | 保持 |

操作：

```bash
pnpm eval:dwb -- --model <m> --base-url <url>
pnpm eval -- --task-id DP-001 --model <m> --base-url <url>
```

任务真相源：`benchmarks/tasks/`、[`benchmarks/README.md`](../../../benchmarks/README.md)。

## 未做 / 债务

| 项 | 说明 |
|----|------|
| PR9 Structured Verifier | json-value / csv-table 等核心类型；现仍以任务 harness 脚本为主 |
| 超时 cancel 竞态 | Agent 超时后 cancel 与取证顺序，见 `docs/eval/archive/Code-Review-v0-v1.md` |
| 诊断子任务 D0/D1 内容 | metadata 可写 ID；多数尚未建独立诊断题 |
| 密钥子进程消毒 | `.env` 仍经 `loadProjectEnv` 进 `process.env` |

## 维护约定

- 不新建第二套 Runner
- 保持 `schemaVersion: 1` 与旧任务兼容
- 设计与实现偏差时改文档或补任务，以代码为准
- 补任务时：reference PASS、≥2 faults FAIL、≥1 hidden variant

原「按 PR 顺序从零实现」提示已失效；维护提示见 [05-coding-agent-prompt.md](./05-coding-agent-prompt.md)。
