# SD-001 · Real Repository Bug Fix

多文件订单计价仓库，修复 ISSUE.md 描述的批量折扣缺陷，测试须全部通过。

```bash
pnpm eval -- --task benchmarks/tasks/SD-001/task.json --model <model> --base-url <url>
```

Verifier：`harness/verify.mjs`（跑测试并校验保护文件未改）。
