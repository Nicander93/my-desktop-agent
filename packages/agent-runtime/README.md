# @desktop-agent/agent-runtime

Desktop Host 与 `@codeany/open-agent-sdk` 之间的 Runtime 层。它管理会话 Agent、将 Profile/Capability 解析为执行策略，并在 SDK 调用前同步 Skill、MCP、子进程环境和路径授权适配；它不依赖 Electron 或 React，也不实现 IPC、SQLite 或 UI。

## 核心边界

- `conversationId === sessionId`；Host 在创建会话时绑定 `cwd` 与 `workspaceId`，运行中的 Agent 不应跨工作区复用。
- `Model Config` 是连接配置（model、apiKey、baseURL）；`Model Capability` 是模型能力（tool calls、上下文窗口、推荐轮次），两者不能混用。
- `Runtime Profile` 是任务场景入口，`Runtime Capability` 是可组合能力片段；二者最终由 `policies/resolver.ts` 合并为 `Execution Policy`。
- 非 `bypassPermissions` 模式下，`pathGuard` 通过 `PathAccessChecker` 在每次工具调用前检查工具输入中的路径；Runtime 不复制 Host 的授权规则。

## 会话生命周期

1. Host 使用 `createAgent(sessionId, sessionOptions)` 创建或复用 SDK Agent。
2. 工作区、模型配置、MCP、Skill 和子进程环境在创建时注入；模型配置 ID 变化时必须关闭旧 Agent 后重建，避免旧凭证继续生效。
3. `sendMessage`/`prompt` 在每轮合并 Profile、Capability、mention 和工具结果截断策略，并将解析快照写入 trace metadata。
4. `close` 删除 Agent、工作区和模型缓存；退出时调用 `closeAll`，并在所有 Agent 关闭后清理 Runtime Skill 注册。

## 策略解析

合并顺序固定为：Profile → Capability → Model Capability → task override → user override。数值上限只允许收紧；不支持 tool calls 的模型会清空全部工具。`resolutionReasons` 会随 trace 保存，排查时不要只凭 UI Profile 推测最终工具权限。

`office-pptx` 使用 officecli 快路径和受限工具集；通用 `office` 不注入 PPT 专用提示。`coding` 的工作区依赖落盘策略由 Electron Host 的 `runtime/policy.ts` 决定。

## 常见修改入口

- 会话缓存、路径检查、trace：`src/runtime.ts`
- Profile 和 Office 策略：`src/profiles.ts`
- Capability 注册：`src/capabilities/`
- Execution Policy 合并规则：`src/policies/resolver.ts`
- Skill 同步：`src/skills.ts`
- 工具结果压缩：`src/tool-results/`

改动 session、profile 或流式调用时，同步检查 [`contributing/comments.md`](../../contributing/comments.md) 和 [`docs/spec-streaming.md`](../../docs/spec-streaming.md)。
