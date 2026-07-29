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

## 文档

- 任务与跑法：[benchmarks/README.md](../../benchmarks/README.md)
- 评测索引：[docs/eval/README.md](../../docs/eval/README.md)
- DWB 设计：[docs/eval/dwb/](../../docs/eval/dwb/)
- 开发者手册 §8：[docs/developer-guide.md](../../docs/developer-guide.md)
