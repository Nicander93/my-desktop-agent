# Desktop Agent 开发者手册

面向本地运行、改代码、审阅 PR。细节以 `contributing/` 为准；本文是入口与审阅清单。

---

## 1. 项目是什么

本地桌面 AI 工作台：**Electron 主进程 + React UI + 进程内 Agent SDK**。

用户通过 Chat 下发任务；Agent 在工作区目录里调工具（读改文件、Bash、MCP、Skill 等）完成 coding / 文件 / Office 类工作。V0 **不做** Computer Use（不控鼠标键盘、不操作任意 GUI）。

产品范围见 [v0.md](./v0.md)。

---

## 2. 仓库地图

```
apps/
  electron/          L2 Host：IPC、SQLite、OS、窗口、bundled runtime
  renderer/          L4 UI：React + Zustand + features/*
packages/
  shared/            Contract：跨进程类型、Skill 解析、trace 分组、评测类型
  open-agent-sdk/    L0 Engine：agent loop、tools、providers、MCP（可独立跑）
  agent-runtime/     L1 Runtime：多 session、profile、路径策略、技能同步
  agent-eval/        评测 CLI（不启 Electron）
benchmarks/          评测任务和 fixture
contributing/        分层、IPC、测试、注释约定
docs/                产品/设计；评测设计在 docs/eval/
scripts/             ensure-built、setup-binaries、dep-check 等
```

`eval-results/` 是跑测输出，已 ignore。别再加回根目录 `evals/`。

pnpm workspace：`apps/*` + `packages/*`。

| 包名 | 角色 |
|------|------|
| `@desktop-agent/shared` | 契约层 |
| `@codeany/open-agent-sdk` | Agent 引擎 |
| `@desktop-agent/agent-runtime` | Desktop Runtime |
| `@desktop-agent/agent-eval` | 评测 runner |
| `@desktop-agent/electron` | 主进程 |
| `@desktop-agent/renderer` | 渲染进程 |

---

## 3. 环境与运行

### 3.1 要求

- **Node**：CI 用 22；本地 ≥18 可跑，建议对齐 22
- **pnpm**：9.x（CI `pnpm/action-setup` 固定 9）
- **OS**：开发主路径是 Windows；`pnpm setup:binaries` **当前仅支持 win32**（bundled node/git/uv）

### 3.2 首次安装

```bash
pnpm install
```

`postinstall` 会跑 `scripts/ensure-built.mjs`，编译 `shared` / `open-agent-sdk` / `agent-runtime`。

Windows 首次还需装本地 runtime 二进制：

```bash
pnpm setup:binaries
```

未安装时，Agent 相关 IPC 会返回「运行时未就绪」。仅检查：

```bash
pnpm setup:binaries -- --check
# 或
pnpm exec tsx scripts/setup-binaries.ts --check
```

### 3.3 配置 `.env`

项目根目录建 `.env`（已被 gitignore）。主进程通过 `apps/electron/src/loadEnvFile.ts` 读取，路径优先级：

1. 仓库根 `.env`
2. `apps/.env`
3. `process.cwd()/.env`

已存在的 `process.env` 不会被覆盖。

| 变量 | 说明 | 默认（未设时） |
|------|------|----------------|
| `CODEANY_API_KEY` | **必填**，LLM Key | 无 → Agent 无法请求 |
| `CODEANY_MODEL` | 模型名 | `deepseek-v4-flash` |
| `CODEANY_API_TYPE` | `openai-completions` / `anthropic-messages` | `openai-completions` |
| `CODEANY_BASE_URL` | API base | `https://api.deepseek.com` |
| `CODEANY_MAX_TURNS` | 单次 query 最大轮次 | `50` |
| `CODEANY_THINKING` | `enabled` / `disabled` / `adaptive` | `enabled` |
| `CODEANY_THINKING_BUDGET` | thinking budget tokens | 可选 |

改 `.env` 后需**重启** `pnpm dev`。

OpenAI 兼容示例：

```env
CODEANY_API_KEY=sk-...
CODEANY_API_TYPE=openai-completions
CODEANY_BASE_URL=https://api.deepseek.com
CODEANY_MODEL=deepseek-v4-flash
```

### 3.4 日常开发

```bash
pnpm dev
```

实际流程：

1. `ensure-built` 保证 packages 已编译
2. 释放 / 等待 renderer 端口（默认 `http://127.0.0.1:3000`）
3. `--check` 二进制是否就绪
4. 并行：`agent-runtime` tsc watch、Vite renderer、Electron

单独包：

```bash
pnpm --filter @desktop-agent/renderer dev
pnpm --filter @desktop-agent/electron dev
pnpm build:packages
pnpm build
```

Windows 打包：`pnpm --filter @desktop-agent/electron dist:win`。

---

## 4. 分层与依赖（审阅硬约束）

完整说明：[contributing/architecture.md](../contributing/architecture.md)。

```
L4 UI (renderer) ──→ Contract (shared)
L3 Bridge (preload + electron.d.ts) ──→ L2 channel/类型
L2 Host (electron) ──→ L1 Runtime ──→ L0 SDK ──→ Contract
```

**禁止反向依赖。** `pnpm dep-check`（dependency-cruiser）会拦：

| 规则 | 含义 |
|------|------|
| `renderer-no-host` | renderer 不得 import electron / agent-runtime / open-agent-sdk |
| `shared-no-upstream` | shared 不得 import apps 或其他 `@desktop-agent/*` |
| `sdk-no-desktop` | open-agent-sdk 不得 import `@desktop-agent/*` |
| `runtime-no-electron` | agent-runtime 不得 import electron / renderer |
| `electron-no-renderer` | main 不得 import renderer |
| `ui-no-features` | `components/ui/` 不得 import `features/` |

### 代码放哪

| 你要做的事 | 改哪里 |
|------------|--------|
| 新增 IPC | `shared` 类型 → `ipc/*Handlers.ts` → `preload.ts` → `electron.d.ts` |
| 工作区 / 对话 / 消息 CRUD | `electron/src/services/` + 对应 handlers |
| 发消息 / 流式 / session | `ipc/agentHandlers.ts` → `AgentRuntime` |
| Profile / 工具策略 | `packages/agent-runtime/src/profiles.ts` |
| 内置 tool | `packages/open-agent-sdk/src/tools/` |
| 跨进程类型 | `packages/shared/src/types/` |
| 聊天 UI / Trace | `apps/renderer/src/features/chat/` |
| 设置页 | `apps/renderer/src/features/settings/` |
| DB schema | `apps/electron/src/db/migrations.ts`（追加 version） |

---

## 5. 核心链路（审阅时先对上这条）

### 5.1 发一条消息

```
Chat UI (features/chat)
  → window.electronAPI (preload)
  → ipcMain agent:send-message (agentHandlers)
  → AgentRuntime.query / createAgent
  → open-agent-sdk Agent / QueryEngine
  → Provider (LLM) + Tools / MCP / Skills
  → main 推送 agent:stream-message
  → renderer 更新消息 / tool / trace
```

约定：**conversationId === sessionId**。session 绑定工作区 `cwd` 与 `workspaceId`；路径权限由 `pathGuard` + `agentPathInterceptor` 在 `permissionMode: 'default'` 下拦截。

### 5.2 Runtime Profile

`classifyRuntimeProfile(content)`（同模型短调用，枚举校验）或显式 `profile` → `getRuntimeProfilePolicy` → 覆盖 `allowedTools` / `maxTurns` / `appendSystemPrompt` / tool result 压缩等。Profile 列表见 shared `AGENT_RUNTIME_PROFILES`（含 `office-pptx`）。

当前重点：`office` 走窄工具集 + Office CLI 约束 prompt；`coding` 等保留更宽策略。设计背景：[agent-runtime-profiles-plan.md](./agent-runtime-profiles-plan.md)。

### 5.3 持久化

SQLite（sql.js），迁移在 `migrations.ts`：

- `workspaces` / `workspace_settings`
- `conversations` / `messages`
- `mcp_servers` / `skills` / `attachments`

新表或改列：追加递增 `version`，不要改已应用的旧 migration 正文。

---

## 6. IPC

流程与 channel 清单：[contributing/ipc-contract.md](../contributing/ipc-contract.md)。

三处必须同步：

1. `apps/electron/src/ipc/*Handlers.ts`
2. `apps/electron/src/preload.ts`
3. `apps/renderer/src/types/electron.d.ts`

约定：

- Channel：`domain:action`
- 返回：`{ success: boolean; error?: string; ... }`
- 业务结构类型放 `@desktop-agent/shared`，不要在 preload 里再声明一份

主要前缀：`agent:*`、`workspace:*`、`workspace-fs:*`、`conversation:*`、`message:*`、`dialog:*`、`mcp:*`、`skill:*`、`attachment:*`。

---

## 7. 质量门禁

提交 / 开 PR 前：

```bash
pnpm check
```

等价于：`typecheck` → `lint` → `dep-check` → `knip` → `test`。

CI（`.github/workflows/check.yml`）对 `main` 的 push / PR 跑同样五步。

分项：

```bash
pnpm typecheck
pnpm lint
pnpm dep-check
pnpm knip
pnpm test
pnpm --filter @desktop-agent/renderer test   # 单包
```

测试原则：[contributing/testing.md](../contributing/testing.md)。测逻辑分支，不测纯 wiring；renderer 可 mock `window.electronAPI`，不要 import runtime/sdk。

---

﻿## 8. 本地评测（agent-eval）

不启 Electron，直接跑 `benchmarks/tasks` 里的题，用 Verifier 判对错。实现在 `packages/agent-eval`。

```bash
pnpm eval -- --task benchmarks/tasks/coding-bugfix-basic/task.json --model <model> --base-url <url>
pnpm eval:coding:smoke -- --model <model> --base-url <url>
pnpm eval:coding:regression -- --model <model> --base-url <url>
pnpm eval:dwb -- --model <model> --base-url <url>
pnpm eval -- --task-id DP-001 --model <model> --base-url <url>
pnpm eval -- --suite smoke --model <model> --dry-run
pnpm eval:report -- --group-by domain,difficulty
```

- Key：`AGENT_EVAL_API_KEY`，没有就用 `.env` 里的 `CODEANY_API_KEY`
- 模型：`--model` / `--base-url`，或 `CODEANY_MODEL` / `CODEANY_BASE_URL`
- Windows：Bash 走 `~/.desktop-agent/binaries/git-bash`；缺了先 `pnpm setup:binaries`
- 过程日志默认打 **stderr**（`[eval]` / `[agent]` / `[tool]` / `[verify]`）；最终 JSON 在 stdout。加 `--quiet` 可关掉过程输出
- 分只看 Verifier；别改 fixture 测试刷分
- 结果在 `eval-results/`（已 ignore）
- DWB（36 题）：`tags` 含 `dwb`，设计见 `docs/eval/dwb/`

细节：`benchmarks/README.md`、`packages/agent-eval/README.md`、`docs/eval/`。

---

## 9. Code Review 清单

按改动所在层勾。分层别破、IPC 别漂、行为能手测或单测。

改 profile / 会话编排 / 流式同步时，按 [comments.md](../contributing/comments.md) 检查受影响链路的相邻注释是否仍然准确。

### 9.1 通用

- [ ] 改动落在正确层；没有「为了方便」跨层 import
- [ ] `pnpm check` 本地能过（或 CI 已绿）
- [ ] 没有把密钥、本地路径、`.env` 提交进仓库
- [ ] 没有无关大重构 / 格式化噪音混进功能 PR
- [ ] 有测的地方：覆盖的是分支/变换，不是镜像实现
- [ ] 公共契约或非显然决策需要说明时，按 [comments.md](../contributing/comments.md) 补充了有效注释

### 9.2 分层与依赖

- [ ] renderer 只通过 `electronAPI` 拿能力，没有直接碰 Node/Electron/SDK
- [ ] shared 仍是纯契约（无 electron/react/runtime）
- [ ] open-agent-sdk 无 `@desktop-agent/*` 依赖
- [ ] agent-runtime 无 electron/react
- [ ] UI 原语 `components/ui/` 未引用 `features/`

### 9.3 IPC / Bridge

- [ ] handlers、preload、`electron.d.ts` 三处一致
- [ ] 需要共享的 payload 已进 `shared/src/types/`
- [ ] channel 命名符合 `domain:action`
- [ ] 错误路径返回 `success: false` + `error`，UI 有处理

### 9.4 Agent / Runtime

- [ ] session 与 workspace cwd 绑定是否正确
- [ ] 新工具默认权限是否过宽（`bypassPermissions` vs `default` + path check）
- [ ] Profile 变更是否误伤非目标任务（office 规则会不会误触发）
- [ ] 流式事件：`partial_message` / token 流是否正常；边角见 [spec-streaming.md](./spec-streaming.md)
- [ ] tool / MCP / Skill 变更是否同步到 mention 与 system prompt

### 9.5 DB

- [ ] 只追加 migration，version 递增
- [ ] CASCADE / 索引是否合理
- [ ] 读写路径与 service 一致，无裸 SQL 散落 UI

### 9.6 Renderer

- [ ] 业务进 `features/<name>/`，`pages/` 只组合
- [ ] 跨 feature 状态放对 store，避免循环依赖
- [ ] 新依赖是否真有用（knip 会盯 unused）

### 9.7 PR 描述建议写清

1. **改了什么**（层 + 文件/行为）
2. **为什么**
3. **怎么验证**（命令、手测步骤）
4. **风险 / 回滚**（IPC 兼容、migration、默认模型/权限）

---

## 10. 常见改动怎么下手

### 加一个 IPC

见 [ipc-contract.md](../contributing/ipc-contract.md) 五步；最后 `pnpm check`。

### 加一个内置 Tool

1. `packages/open-agent-sdk/src/tools/` 实现并注册
2. 若 Desktop 要默认允许/禁止：改 `agent-runtime` profile policy
3. UI 若要展示特殊卡片：`features/chat/`（不要在 sdk 里依赖 UI）

### 加设置项 / MCP / Skill

- 持久化：`services/*` + migration（如需新列）
- IPC：对应 `*Handlers.ts`
- UI：`features/settings/` 或 `features/tools-panel/`

### 改 Agent 默认模型或超时

优先环境变量（`.env`）；代码默认值在 `main.ts` / `agentHandlers.ts` 的 `readAgentEnv` 路径。避免只改一处导致 UI 文案与实际不一致。

---

## 11. 排障

| 现象 | 先查 |
|------|------|
| Agent 不说话 / 立即失败 | 根目录 `.env` 是否有 `CODEANY_API_KEY`；是否重启过 `pnpm dev`；主进程日志里 `Agent 已配置` |
| 「运行时未就绪」 | `pnpm setup:binaries`（仅 Windows） |
| 端口占用 / Electron 白屏 | `scripts/free-dev-port.ts`；`ELECTRON_RENDERER_URL` 是否指向 Vite（默认 `3000`） |
| 改了 packages 不生效 | `pnpm build:packages` 或确认 `dev` 里 runtime watch 在跑 |
| dep-check 红 | 对照第 4 节规则，把 import 挪回正确层 |
| knip 红 | 删未用导出/依赖，或在 `knip.json` 说明 ignore 理由（少用） |
| 路径访问弹窗过多 | workspace `allowedPaths` / `restrictedMode`；工具是否越出 cwd |

---

## 12. 已知债务与设计中事项

来自 architecture / spec，审阅时别当「新 bug」反复提：

- shared 与 open-agent-sdk 的 trace 类型仍有部分重复
- renderer 部分依赖（如 `date-fns`、`jszip`）knip 侧已 ignore，待清理
- 流式已接 SDK `stream` + `partial_message`；边角见 [spec-streaming.md](./spec-streaming.md)
- 评测：Structured Verifier、超时 cancel 竞态等见 [Evaluation-Roadmap-v2.md](./eval/Evaluation-Roadmap-v2.md)

---

## 13. 文档索引

| 文档 | 用途 |
|------|------|
| [AGENTS.md](../AGENTS.md) | Agent/AI 贡献入口 |
| [code-style.md](../contributing/code-style.md) | 代码格式、命名与注释风格 |
| [architecture.md](../contributing/architecture.md) | 分层与目录 |
| [ipc-contract.md](../contributing/ipc-contract.md) | IPC 流程与 channel |
| [testing.md](../contributing/testing.md) | 测什么、放哪 |
| [comments.md](../contributing/comments.md) | 注释怎么写 |
| [v0.md](./v0.md) | 产品范围 |
| [agent-runtime-profiles-plan.md](./agent-runtime-profiles-plan.md) | Profile 设计（Phase 1–3 已落地） |
| [spec-streaming.md](./spec-streaming.md) | 流式：已实现 + 剩余边角 |
| [benchmarks/README.md](../benchmarks/README.md) | 评测任务与 fixture（含 DWB） |
| [packages/agent-eval/README.md](../packages/agent-eval/README.md) | 评测 CLI |
| [docs/eval/](./eval/) | 评测入口 / 架构 / 路线图 |
| [docs/eval/dwb/](./eval/dwb/) | DWB 36 Golden Tasks 设计 |
| [docs/eval/archive/](./eval/archive/) | 评测历史稿 |
| [open-agent-sdk README](../packages/open-agent-sdk/README.md) | SDK 独立用法 |
