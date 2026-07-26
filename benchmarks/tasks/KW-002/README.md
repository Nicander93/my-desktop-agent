# KW-002 · Meeting Minutes

从 `input/transcript.md` 生成 `output/minutes.md` 与 `output/actions.csv`，严格基于证据 ID，禁止臆造负责人/日期。

```bash
pnpm eval -- --task benchmarks/tasks/KW-002/task.json --model <model> --base-url <url>
```

Verifier：`harness/verify.mjs`。
