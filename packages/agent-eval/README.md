# @desktop-agent/agent-eval

无头评测 runner：加载 `benchmarks/tasks`，隔离 workspace，调用 `agent-runtime`，用 Verifier 判分，结果写入 `eval-results/`。

## 命令

根目录：

```bash
# 模型/BaseURL 优先读仓库根 .env（CODEANY_MODEL / CODEANY_BASE_URL）
pnpm eval -- --task benchmarks/tasks/coding-bugfix-basic/task.json
pnpm eval:coding:smoke
pnpm eval:dwb
pnpm eval -- --task-id DP-001 --repeat 5
# 多现场并行：拆成 N 个独立子进程，各跑一批任务
pnpm eval -- --all --concurrency 4 --output eval-results/_full-run
pnpm eval:report -- --group-by domain,difficulty
```

常用 flag：`--suite` / `--task-id` / `--tag` / `--domain` / `--difficulty` / `--repeat` / `--concurrency` / `--diagnose` / `--dry-run` / `--quiet` / `--all`。

Key：`AGENT_EVAL_API_KEY` 或 `.env` 的 `CODEANY_API_KEY`。模型：`.env` 的 `CODEANY_MODEL` / `CODEANY_BASE_URL`（也可 `--model` / `--base-url` 覆盖）。

Windows 下 Bash 工具走 `~/.desktop-agent/binaries/git-bash`（与 Electron 相同）；没有就先 `pnpm setup:binaries`。

## Runner 流程与边界

Runner 从 `benchmarks/tasks` 加载 Task Schema，复制 fixture 到每次运行独有的 `workspace`，再调用 `agent-runtime`。每轮结束后写 diff、运行 Verifier，并把 result、trace 与 diff 工件写入 `eval-results/`。本包不启动 Electron，也不允许通过修改 benchmark fixture 或测试来提高分数。

任务声明的 `profile` 和 `capabilities` 会传入 Runtime 解析最终 Execution Policy；它们不是模型连接配置。评测 Runtime 固定关闭宿主环境上下文，防止工作区外的 Git 状态、项目说明或本地配置干扰结果。

Verifier 是通过状态的唯一依据。模型返回“完成”、没有抛错或写入文本都不足以判定通过。`maxChangedFiles` 等 Runner 级限制会在 Verifier 结果后追加并重新计算最终状态。

## 重试、超时与结果

失败和超时可在同一 session 中携带失败反馈继续执行，避免丢失已完成的正确工作；不可继续的 executor 会明确报错。超时会请求 executor cancel 并在 finally 释放 session。取消与最终收集存在竞态，报告分析时应优先查看 `result.json` 的 attempts、failure 与 trace 工件。

每次 run 都使用独立输出目录和 sessionId。不要假设不同运行可共享 workspace、Agent 内存或临时文件。

## 文档

- 任务与跑法：[benchmarks/README.md](../../benchmarks/README.md)
- 评测索引：[docs/eval/README.md](../../docs/eval/README.md)
- DWB 设计：[docs/eval/dwb/](../../docs/eval/dwb/)
- 开发者手册 §8：[docs/developer-guide.md](../../docs/developer-guide.md)
