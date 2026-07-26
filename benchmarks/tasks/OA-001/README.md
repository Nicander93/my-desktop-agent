# OA-001 · Excel Analysis Dashboard

从 `input/sales.csv` 生成 `output/dashboard.xlsx` 与 `output/summary.json`。

```bash
pnpm eval -- --task benchmarks/tasks/OA-001/task.json --model <model> --base-url <url>
```

Verifier：`harness/verify.mjs`（Node 解压 OOXML 校验表、数值与图表）。
