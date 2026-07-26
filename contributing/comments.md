# 代码注释

靠 Agent 改代码时，人要靠注释看清边界。注释写「为什么」和约束，别复述代码在干什么。

## 要写什么

源码默认都写（`apps/`、`packages/`、`scripts/`）：

- **文件头**：这个文件管什么、别在这里找什么、改错容易踩哪
- **导出的类 / 函数 / 类型**：一两句用途；有副作用、失败路径、优先级就写上
- **关键变量**：session map、策略表、关键词表、故意空串/魔法数——写清含义和生命周期

可以很短：

- `dist/`、`node_modules/`、生成物
- 测试：文件头说测哪块就行
- `vite`/`vitest` 配置：一行
- `components/ui/*`：标明 shadcn 原语、无业务

## 写法

- 中文
- 先写约束和取舍，少写「该函数用于…」
- 能一行就一行；别写职责/不负责/上下游排比模板
- docs 里已有的流程，代码里指一下路径即可

## 别写

- 复述函数名
- JSX 每个节点旁注
- `index.ts` 功能清单、大横幅分区
- 过时注释（行为变了就改或删）

## 改策略时先看这些

1. `packages/agent-runtime/src/runtime.ts`
2. `packages/agent-runtime/src/policies/resolver.ts`
3. `packages/agent-runtime/src/profiles.ts`
4. `apps/electron/src/ipc/agentHandlers.ts`
5. `apps/electron/src/runtime/policy.ts`
6. `packages/open-agent-sdk/src/engine.ts`
7. `packages/open-agent-sdk/src/providers/openai.ts`
8. `apps/renderer/src/hooks/useAgent.ts`
9. `packages/agent-eval/src/runner.ts`
10. `packages/shared/src/types/mcp.ts`

新文件或这次改到的导出符号，合并前按上面补齐。
