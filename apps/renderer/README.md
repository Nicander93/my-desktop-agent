# @desktop-agent/renderer

React + Zustand 的 UI 层。业务组件按 `src/features/<name>/` 组织，`pages/` 只组合 Feature，`components/ui/` 只放无业务的 UI 原语。Renderer 只能通过 `window.electronAPI` 与 Host 通信，不能直接依赖 Electron、Runtime 或 SDK。

## 状态与流式消息

Zustand store 负责 UI 可见状态和消息缓存；跨 Feature 状态应放进对应 store，避免组件隐式拥有全局数据。`hooks/useAgent.ts` 订阅 `agent:stream-message`，把 token、工具调用和 trace 合并到占位 assistant 消息；会话切换后必须丢弃迟到事件，并在流结束时持久化最终消息。

IPC 类型来自 shared 与 `src/types/electron.d.ts`。新增 Host 能力时不得在 renderer 手写重复 payload 类型，需随 preload 契约一起更新。

## 重点入口

- Chat、流式与 Trace：`src/features/chat/`、`src/hooks/useAgent.ts`
- Workspace/Settings：`src/features/workspace/`、`src/features/settings/`
- Zustand：`src/stores/`
- 纯展示工具：`src/components/ui/`

分层与测试规则见 [`contributing/architecture.md`](../../contributing/architecture.md) 和 [`contributing/testing.md`](../../contributing/testing.md)。
