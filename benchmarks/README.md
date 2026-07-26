# Benchmarks

任务定义和 fixture 放这里。跑的时候由 `packages/agent-eval` 拷到隔离目录，结果写到 `eval-results/`（已 ignore）。

不要靠改测试、保护文件或 expected 快照来刷通过率。

## 目录

```
benchmarks/tasks/<task-id>/
  task.json
  fixture/
  expected/   # 可选，snapshot 用
```

`task.json` 里的 `suite`（如 `smoke`）给 `--suite` 用。

## 现有任务

| id | suite | 做什么 |
|----|-------|--------|
| `coding-bugfix-basic` | — | 修筛选逻辑，跑 test/build |
| `coding-smoke-001`…`003` | smoke | 小编码题 |
| `coding-regression-001`…`003` | regression | 回归题 |
| `coding-mario-web` | — | 平台跳跃：`createGame` 行为检查；判分在 `harness/`（不进 Agent workspace） |
| `office-ai-ppt` | — | PPT，命令/OOXML 校验 |
| `office-excel-report` | — | Excel，同上 |

通过与否只看 Verifier。

coding 题的 `limits.maxTurns` / `timeoutMs` 按本地小模型偏松（smoke 24 / bugfix 32 / regression 36）。云端大模型可再收紧。

## 运行

```bash
pnpm eval -- --task benchmarks/tasks/coding-bugfix-basic/task.json --model <model> --base-url <url>
pnpm eval:coding:smoke -- --model <model> --base-url <url>
pnpm eval:coding:regression -- --model <model> --base-url <url>
```

过程日志默认打到 **stderr**（`[eval]` / `[agent]` / `[tool]` / `[verify]`）；最终 `result.json` 内容仍打印在 stdout。只要结果、不要过程时加 `--quiet`。

入口说明：`docs/developer-guide.md`；设计稿：`docs/eval/`。
