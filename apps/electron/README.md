# @desktop-agent/electron

Desktop Host（Electron 主进程）：初始化本地运行时、SQLite、窗口与 IPC，并将工作区、模型和权限上下文编排给 `agent-runtime`。本包不实现 Agent loop，也不承载 renderer 业务状态。

## 初始化与边界

`src/main.ts` 依次加载 `.env`、bundled runtime、数据库迁移、服务、`AgentRuntime`、IPC 与窗口。业务 IPC 使用 `domain:action` channel；每次新增或修改 channel 都必须同步：handler、`src/preload.ts`、renderer `src/types/electron.d.ts` 和 shared 契约类型。

SQLite 访问集中在 `src/services/`；迁移仅允许在 `src/db/migrations.ts` 追加递增版本，不能改写已应用 migration。窗口、原生 dialog 和文件系统能力也只在此层实现。

## Agent 与安全

`ipc/agentHandlers.ts` 将 `conversationId` 作为 Runtime `sessionId`，并从会话查得绑定的 workspace cwd。默认 Runtime 使用 `permissionMode: 'default'`；工具路径必须经 `pathGuard`/`agentPathInterceptor`，不要为局部需求绕过该策略。Profile 的子进程环境与 bundled 二进制规则在 `src/runtime/policy.ts`。

## 常见入口

- Agent 流与会话：`src/ipc/agentHandlers.ts`
- preload bridge：`src/preload.ts`
- 服务和 SQLite：`src/services/`、`src/db/`
- bundled runtime：`src/runtime/`
- 窗口启动：`src/main.ts`

开发与质量门禁见 [`docs/developer-guide.md`](../../docs/developer-guide.md)。
