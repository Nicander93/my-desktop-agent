# Agent Instructions

开发前先读：

1. [docs/developer-guide.md](docs/developer-guide.md) — 运行、仓库地图、Review 清单
2. [contributing/architecture.md](contributing/architecture.md) — 分层与文件放置
3. [contributing/ipc-contract.md](contributing/ipc-contract.md) — IPC 变更流程
4. [contributing/testing.md](contributing/testing.md) — 测试原则
5. [contributing/comments.md](contributing/comments.md) — 注释怎么写

改评测任务看 [benchmarks/README.md](benchmarks/README.md)；评测设计看 [docs/eval/](docs/eval/)。

提交前运行：

```bash
pnpm check
```

改 session / profile / 流式相关逻辑时，注释跟着改。
