# DP-001 · Messy CSV Cleaner

清洗 `input/orders.csv`，输出 `output/cleaned.csv`、`output/invalid_rows.csv`、`output/report.json`。

```bash
pnpm eval -- --task benchmarks/tasks/DP-001/task.json --model <model> --base-url <url>
```

Verifier：`harness/verify.mjs`（不进 Agent workspace）。
