# FM-002 · Safe Batch Rename

按 `input/rename-rules.json` 对 `input/inbox/` 生成 dry-run 改名计划，输出 `output/rename-plan.json`、`output/manifest.json`、`output/rollback.json`。不得改动输入文件。

```bash
pnpm eval -- --task benchmarks/tasks/FM-002/task.json --model <model> --base-url <url>
```

Verifier：`harness/verify.mjs`（不进 Agent workspace）。
