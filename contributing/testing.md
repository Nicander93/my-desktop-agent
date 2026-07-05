# Testing Guide

## Running Tests

```bash
pnpm test                    # 全仓库 vitest
pnpm --filter @desktop-agent/renderer test
pnpm --filter @desktop-agent/electron test
pnpm --filter @desktop-agent/agent-runtime test
pnpm --filter @desktop-agent/shared test
```

提交前运行 `pnpm check`（typecheck + lint + dep-check + knip + test）。

## What to Test

测 **逻辑**，不测 wiring。好的单测覆盖非显而易见的分支。

**值得测：**

- 带分支、正则、计算的纯函数（`lib/`、`shared/`）
- profile 推断、mention 解析、trace 分组
- Service 层数据变换（electron `services/`）

**可以跳过：**

- 类型定义、常量、简单 re-export
- 纯布局组件（无逻辑）
- 与实现逐行镜像的测试

> 若测试只是在证明「代码做了代码做的事」，价值很低。

## File Placement

测试与源文件同目录或 `tests/` 子目录：

```
packages/shared/src/trace/groupTrace.ts
packages/shared/tests/groupTrace.test.ts

apps/renderer/src/lib/toolCallSync.ts
apps/renderer/tests/toolCallSync.test.ts
```

## Architecture Alignment

测试 import 遵循与源码相同的分层规则（见 [architecture.md](./architecture.md)）：

- shared / lib 单测不 import renderer 或 electron
- renderer 单测可 mock `window.electronAPI`，不 import agent-runtime 或 sdk
