# Architecture

## Layer Model

本仓库是 **Electron monorepo + Agent SDK**，分层以 **包边界 / 进程** 为主，renderer 内部为辅。

```
Contract   packages/shared              跨进程类型与纯函数
L0 Engine  packages/open-agent-sdk      Agent loop、内置 tools、MCP
L1 Runtime packages/agent-runtime       Desktop 策略（profile、session、路径）
L2 Host    apps/electron               IPC、DB、OS、窗口
L3 Bridge  preload + electron.d.ts      极薄 IPC 契约
L4 UI      apps/renderer               React UI（仅 shared + electronAPI）
```

**设计目标**：每个需求能映射到明确的改动位置；跨层依赖由 `pnpm dep-check` 自动拦截。

## Dependency Rules

高层可依赖低层，禁止反向。

```
L4 UI ──→ Contract
L3 Bridge ──→ L2 Host（channel 名与类型）
L2 Host ──→ L1 Runtime ──→ L0 Engine ──→ Contract
L1 Runtime ──→ Contract
L0 Engine ──→（不依赖任何 @desktop-agent/*）
Contract ──→（不依赖 apps / 其他 packages）
```

由 [`.dependency-cruiser.cjs`](../.dependency-cruiser.cjs) 执行，本地运行 `pnpm dep-check`，CI 同样 gate。

## Directory Layout

### Contract — `packages/shared/`

```
shared/src/
├── types/          IPC 与业务共享类型
├── skills/         Skill 解析（纯函数）
└── trace/          UI 侧 trace 分组工具
```

- 禁止 import electron、react、agent-runtime、open-agent-sdk
- Trace：**UI 扩展**放 shared；**引擎原始结构**放 `open-agent-sdk/src/trace.ts`，禁止第三处再定义

### L0 — `packages/open-agent-sdk/`

Agent 引擎，可独立运行（`examples/`）。禁止 import `@desktop-agent/*`。

### L1 — `packages/agent-runtime/`

Desktop 封装：多 session、profile、MCP 测试、路径策略。禁止 import electron / react。

**不要**在 `index.ts` 中 re-export `@desktop-agent/shared`；调用方显式 `import from '@desktop-agent/shared'`。

### L2 — `apps/electron/`

```
electron/src/
├── main.ts           入口：初始化、窗口、注册 handlers
├── preload.ts        L3 Bridge
├── ipc/              *Handlers.ts，按领域拆分
├── services/         业务逻辑（DB、文件、MCP…）
├── db/               SQLite
└── runtime/          Bundled node/git/uv
```

Agent IPC 在 `ipc/agentHandlers.ts`（与 workspace/conversation 等一致）。

### L3 — Bridge

`preload.ts` 与 `apps/renderer/src/types/electron.d.ts` **成对维护**。只做 `contextBridge`，不含业务逻辑。变更流程见 [ipc-contract.md](./ipc-contract.md)。

### L4 — `apps/renderer/`

```
renderer/src/
├── components/ui/       shadcn 原语，无业务
├── components/layout/   全局布局（AppLayout、NavSidebar）
├── lib/                 纯函数
├── hooks/               跨 feature 通用 hook
├── features/
│   ├── chat/
│   ├── workspace/
│   ├── settings/
│   └── tools-panel/
├── pages/               路由薄层，只组合 feature
└── stores/              Zustand
```

- `pages/` 只组合，不写复杂逻辑
- `components/ui/` 禁止 import `features/`
- 新功能进 `features/<name>/`；`chat` / `workspace` / `settings` / `tools-panel` 已迁入 `features/`

## Common Tasks: Where to Put Code

| 任务 | 层 | 位置 |
|------|-----|------|
| 新增 IPC 通道 | L3 + L2 | `preload.ts` + `ipc/*Handlers.ts` + `electron.d.ts` |
| 对话/工作区 CRUD | L2 | `apps/electron/src/services/` + `ipc/` |
| Agent 发送/流式/session | L2 + L1 | `ipc/agentHandlers.ts` → `AgentRuntime` |
| Profile / 路径策略 | L1 | `packages/agent-runtime/src/profiles.ts` |
| 新 Agent 内置 tool | L0 | `packages/open-agent-sdk/src/tools/` |
| 跨进程类型 | Contract | `packages/shared/src/types/` |
| 聊天 UI / Trace 展示 | L4 | `apps/renderer/src/features/chat/` |
| 新 shadcn 组件 | L4 | `apps/renderer/src/components/ui/` |
| 设置页表单项 | L4 | `apps/renderer/src/features/settings/` |

## Conventions

- **Import 路径**：renderer 内跨目录用 `@/` alias；packages 用 workspace 包名
- **无 barrel 滥用**：优先从具体文件 import，避免 `export *` 模糊边界
- **IPC 类型**：共享类型放 `shared`，preload/renderer 只做引用

## Known Debt

- shared 与 open-agent-sdk 的 trace 类型仍有部分重复，收敛中
- renderer 中 `date-fns`、`jszip` 等待 knip 清理的未使用依赖
