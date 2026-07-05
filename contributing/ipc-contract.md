# IPC Contract

渲染进程通过 `window.electronAPI` 访问主进程。契约由三处同步维护：

| 文件 | 角色 |
|------|------|
| [`apps/electron/src/preload.ts`](../apps/electron/src/preload.ts) | 暴露 API |
| [`apps/renderer/src/types/electron.d.ts`](../apps/renderer/src/types/electron.d.ts) | 渲染进程类型 |
| [`apps/electron/src/ipc/*Handlers.ts`](../apps/electron/src/ipc/) | 主进程 handler |

## 变更流程

新增或修改 IPC 时，按顺序改：

1. 在 `shared/src/types/` 补充请求/响应类型（若需跨进程共享）
2. 在对应 `ipc/*Handlers.ts` 实现 `ipcMain.handle`
3. 在 `preload.ts` 增加 `ipcRenderer.invoke` / `ipcRenderer.on`
4. 在 `electron.d.ts` 补充 `Window.electronAPI` 类型
5. 跑 `pnpm check`

## Channel 清单

### agent

| Channel | 方向 | 说明 |
|---------|------|------|
| `agent:create-session` | invoke | 预创建 session，绑定工作区 cwd |
| `agent:send-message` | invoke | 发送消息，流式执行 |
| `agent:prompt` | invoke | 非流式单次 prompt |
| `agent:get-messages` | invoke | 获取 session 消息 |
| `agent:get-trace-run` | invoke | 按 runId 取 trace |
| `agent:get-latest-trace-run` | invoke | 最新 trace run |
| `agent:close-session` | invoke | 关闭 session |
| `agent:stream-message` | event (main→renderer) | 流式推送 SDK 消息 |

### workspace

| Channel | 说明 |
|---------|------|
| `workspace:create` | 弹窗选目录创建工作区 |
| `workspace:create-from-path` | 指定路径创建 |
| `workspace:get-all` / `get` / `update` / `delete` / `touch` | CRUD |
| `workspace:get-settings` / `update-settings` | 工作区设置 |

### conversation / message

| 前缀 | 说明 |
|------|------|
| `conversation:*` | 对话 CRUD |
| `message:*` | 消息 CRUD |

### dialog

| Channel | 说明 |
|---------|------|
| `dialog:select-directory` | 系统目录选择 |
| `dialog:confirm-path-access` | Agent 路径访问确认 |

### workspace-fs

| 前缀 | 说明 |
|------|------|
| `workspace-fs:stat` / `read` / `write` / `read-dir` / `search` / `get-preview-url` | 工作区文件操作 |

### mcp / skill

| 前缀 | 说明 |
|------|------|
| `mcp:*` | MCP 服务器 CRUD、catalog、连接测试 |
| `skill:*` | Skill CRUD、catalog、导入 |

## 约定

- Channel 名格式：`domain:action`（kebab-case action）
- Handler 返回 `{ success: boolean; ... }`，错误用 `error` 字段
- 共享 payload 类型定义在 `@desktop-agent/shared`，不在 preload 内重复声明业务结构
