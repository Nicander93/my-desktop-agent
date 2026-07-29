# @desktop-agent/agent-eval

无头评测 runner：加载 `benchmarks/tasks`，隔离 workspace，调用 `agent-runtime`，用 Verifier 判分，结果写入 `eval-results/`。

## 命令

根目录：

```bash
pnpm eval -- --task benchmarks/tasks/coding-bugfix-basic/task.json --model <m> --base-url <url>
pnpm eval:coding:smoke -- --model <m> --base-url <url>
pnpm eval:dwb -- --model <m> --base-url <url>
pnpm eval -- --task-id DP-001 --repeat 5 --model <m> --base-url <url>
pnpm eval:report -- --group-by domain,difficulty
```

常用 flag：`--suite` / `--task-id` / `--tag` / `--domain` / `--difficulty` / `--repeat` / `--diagnose` / `--dry-run` / `--quiet`。

Key：`AGENT_EVAL_API_KEY` 或 `.env` 的 `CODEANY_API_KEY`。模型：`--model` / `--base-url` 或 `CODEANY_MODEL` / `CODEANY_BASE_URL`。

Windows 下 Bash 工具走 `~/.desktop-agent/binaries/git-bash`（与 Electron 相同）；没有就先 `pnpm setup:binaries`。

## 文档

- 任务与跑法：[benchmarks/README.md](../../benchmarks/README.md)
- 评测索引：[docs/eval/README.md](../../docs/eval/README.md)
- DWB 设计：[docs/eval/dwb/](../../docs/eval/dwb/)
- 开发者手册 §8：[docs/developer-guide.md](../../docs/developer-guide.md)
