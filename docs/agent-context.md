# Agent 上下文与任务路由

这是仓库的 Agent 上下文索引。只记录难以从单个文件快速恢复、且会影响改动落点或验证方式的稳定事实；实现细节以代码和对应专题文档为准。

## 产品与范围

Desktop Agent 是一个本地桌面 AI 工作台。用户在 Chat 中提出 coding、文件处理、Office 或 MCP 任务；Agent 在选定工作区内通过工具执行任务并反馈过程与结果。

V0 不提供 Computer Use（鼠标、键盘、屏幕或任意 GUI 自动化）、多 Agent 编排、账号/云端同步。完整产品范围见 [V0 PRD](specs/v0.md)。

## 真实分层

```text
renderer (L4 React UI)
  -> preload / Window.electronAPI (L3 Bridge)
  -> electron main、IPC、SQLite、OS integration (L2 Host)
  -> agent-runtime：session、profile、路径与能力策略 (L1 Runtime)
  -> open-agent-sdk：agent loop、provider、tools、MCP (L0 SDK)
       ↘ shared：跨进程 contract、公共解析与类型
```

- `packages/shared` 是纯 contract 层，不能依赖应用或其他 `@desktop-agent/*` 包。
- `open-agent-sdk` 不能依赖 Desktop 包；`agent-runtime` 不能依赖 Electron 或 React；renderer 不能直接依赖 host、runtime 或 SDK。
- Renderer 只通过 `window.electronAPI` 取得主进程能力。UI 业务放 `features/<name>/`，`pages/` 只组合 feature，`components/ui/` 不依赖 feature。
- 依赖边界由 `pnpm dep-check` 检查；完整规则和落点见 [架构](../contributing/architecture.md)。

## 核心链路与约束

发消息路径为：

```text
chat feature -> preload -> agent:send-message handler
  -> AgentRuntime -> open-agent-sdk -> provider / tools / MCP
  -> agent:stream-message -> renderer 状态更新
```

- `conversationId` 同时是 Agent `sessionId`；session 绑定 workspace 的 `cwd`。
- 主进程在启动时加载环境、初始化 bundled runtime 与 SQLite、创建 `AgentRuntime`，然后注册 IPC 和窗口。入口是 `apps/electron/src/main.ts`。
- Desktop 主进程以 `permissionMode: 'default'` 创建 Runtime；路径访问由 `pathGuard` 和 `agentPathInterceptor` 处理。不要因局部需求绕开此策略。
- 业务 IPC 的共享请求/响应类型放 `packages/shared/src/types/`；新增或修改 IPC 时，要同步 handler、`preload.ts` 和 renderer 的 `electron.d.ts`。详见 [IPC 契约](../contributing/ipc-contract.md)。
- SQLite schema 迁移只追加新的递增 version，不能改写已应用迁移。

## 按任务阅读

| 任务                            | 先读                                                                               | 常见改动位置                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 开发、运行、排障或提交          | [开发者手册](developer-guide.md)                                                   | 根 `package.json`、`scripts/`、对应 app/package                                            |
| 新增或修改 IPC                  | [IPC 契约](../contributing/ipc-contract.md)                                        | `shared/src/types/`、`electron/src/ipc/`、`preload.ts`、`renderer/src/types/electron.d.ts` |
| Agent 消息、session、流式或权限 | [架构](../contributing/architecture.md)、[注释细则](../contributing/comments.md)   | `agentHandlers.ts`、`agent-runtime/src/runtime.ts`、路径策略                               |
| Profile、工具策略或 MCP/Skill   | [开发者手册](developer-guide.md)、[注释细则](../contributing/comments.md)          | `agent-runtime/src/profiles.ts`、`policies/`、SDK 的 `tools/` 或 `skills/`                 |
| 数据持久化                      | [架构](../contributing/architecture.md)                                            | `electron/src/services/`、`electron/src/db/migrations.ts`                                  |
| Renderer 功能                   | [架构](../contributing/architecture.md)、[代码风格](../contributing/code-style.md) | `renderer/src/features/`、`stores/`、薄的 `pages/`                                         |
| 单元测试                        | [测试原则](../contributing/testing.md)                                             | 源文件同级或对应 `tests/`；测逻辑分支，不测纯 wiring                                       |
| 评测任务或 runner               | [benchmarks 指南](../benchmarks/README.md)、[评测索引](eval/README.md)             | `benchmarks/tasks/`、`packages/agent-eval/`                                                |

## 工作流与验证

- 初次安装：`pnpm install`；Windows 还需 `pnpm setup:binaries`。本地启动：`pnpm dev`。
- 根 `.env` 至少需要 `CODEANY_API_KEY`；改动后重启开发进程。配置和排障细节见 [开发者手册](developer-guide.md)。
- 提交前运行 `pnpm check`，它依次执行 typecheck、lint、依赖边界检查、knip 和测试。
- 改动遵循最小正确范围：先确认真实链路与影响，再在解决全部受影响路径的最窄共享位置修复；不要为假设需求添加抽象或依赖。

## 文档维护

- 活跃的执行计划应随工作进展更新；本仓库已有计划保留在原位置，不新建并行计划目录。
- 对 `AGENTS.md`、本文件、架构和产品等持久文档，先提出变更建议并获得确认；用户明确要求文档维护时可直接更新。
- 只记录稳定、难从代码恢复且会影响后续工作的事实。发现文档与代码冲突时，报告冲突并以代码为当前行为依据。

## 已知文档不一致

`docs/specs/v0.md` 的技术栈章节写有 Tauri 2，但当前工作区、`apps/electron/` 和 [开发者手册](developer-guide.md) 都表明实际桌面宿主为 Electron。未在本次上下文重建中改写 PRD；涉及技术选型时以代码和开发者手册为准，后续应确认产品文档是否需要单独修订。
