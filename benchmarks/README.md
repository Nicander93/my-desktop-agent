# Benchmarks

任务定义和 fixture 是版本化的评测输入。运行产物写入 `eval-results/`，不应修改任务测试或参考结果来提高通过率。

当前 PR 2 提供 `coding-bugfix-basic`，可通过：

```bash
pnpm --filter @desktop-agent/agent-eval build
node packages/agent-eval/dist/cli.js --task benchmarks/tasks/coding-bugfix-basic/task.json --model <model> --base-url <url>
```

PR 4 还提供 `coding-mario-web`、`office-ai-ppt`、`office-excel-report`。每项均由命令或 OOXML 包结构 Verifier 判定，不使用模型自评。
