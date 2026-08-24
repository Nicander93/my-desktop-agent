# Agent Instructions

先读 [Agent 上下文与任务路由](docs/agent-context.md)。它说明产品边界、分层、核心链路，以及不同任务该读哪些文档。

## 必须遵守

- 保留现有文件编码；新文件优先 UTF-8。
- 尽量局部修改；不要以整文件重写或无关格式化制造噪音。
- 改代码前，按任务阅读上下文文档所路由的专题规范；代码和测试是当前行为的事实来源。
- 提交前运行 `pnpm check`。若无法运行，说明未运行的原因和已完成的替代验证。
- 源码注释统一使用英文，TSDoc 必须使用多行格式；只补充代码无法自证的契约、原因和边界，改动实现时同步维护相邻注释。细则见 [代码注释](contributing/comments.md)。

## 任务入口

- 开发、运行、排障、质量门禁： [开发者手册](docs/developer-guide.md)
- 代码风格： [代码风格](contributing/code-style.md)
- 分层、文件放置和依赖边界： [架构](contributing/architecture.md)
- 跨进程能力： [IPC 契约](contributing/ipc-contract.md)
- 测试： [测试原则](contributing/testing.md)
- 评测任务： [benchmarks/README.md](benchmarks/README.md)；评测设计： [docs/eval/](docs/eval/)
