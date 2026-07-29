# Agent Instructions

这是仓库级入口，只放必须遵守的规则与文档导航。详细规范按主题拆分，修改代码前按需阅读：

- [开发入口与仓库地图](docs/developer-guide.md)：安装、运行、评测、质量门禁和 Review 清单。
- [代码风格](contributing/code-style.md)：格式化、命名、导入和注释风格。
- [架构与文件放置](contributing/architecture.md)：Electron / Runtime / SDK 分层及依赖边界。
- [IPC 契约](contributing/ipc-contract.md)：跨进程类型、handler、preload 和 renderer 的同步流程。
- [测试原则](contributing/testing.md)：测试位置、覆盖重点和运行命令。
- [注释细则](contributing/comments.md)：源码注释的范围、内容和策略变更检查清单。

改评测任务看 [benchmarks/README.md](benchmarks/README.md)；评测设计看 [docs/eval/](docs/eval/)。

提交前运行：

```bash
pnpm check
```

改 session / profile / 流式相关逻辑时，注释跟着改。
