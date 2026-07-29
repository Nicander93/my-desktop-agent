# `@desktop-agent/agent-runtime` 代码导读

这是一层位于 Desktop Host 和 Agent SDK 之间的运行时封装。它不负责 Electron、IPC、数据库或 UI，主要负责把一次会话需要的配置、安全策略和扩展能力组装成 SDK Agent。

## 一句话定位

```text
Electron IPC
    ↓
AgentRuntime（session / profile / policy / MCP / skills / path guard）
    ↓
@codeany/open-agent-sdk（agent loop / tools / provider / trace）
```

## 目录结构

```text
src/
├─ index.ts                         对外 API 汇总
├─ runtime.ts                       AgentRuntime 主类，会话与 Agent 生命周期
├─ profiles.ts                      profile 策略与 AgentOptions 覆盖
├─ classifyProfile.ts               用一次短模型调用判断 profile
├─ policies/
│  ├─ types.ts                      执行策略相关类型
│  └─ resolver.ts                   profile → capability → model → override 合并
├─ capabilities/
│  ├─ types.ts                      capability 类型
│  └─ registry.ts                   capability 对工具和结果大小的约束
├─ mcp.ts                           MCP 预安装、连接测试、SDK 配置转换
├─ skills.ts                        将运行时 Skill 注册到 SDK
├─ pathUtils.ts                     从工具参数提取路径，供越界检查使用
├─ tool-results/transformer.ts      超长工具结果的头尾保留与摘要标记
└─ types.ts                         较早期的兼容类型，新增逻辑优先使用 shared 类型
```

## 核心对象：`AgentRuntime`

`runtime.ts` 是主入口。它用 `sessionId → Agent` 缓存 SDK Agent，并记录 session 对应的 workspace 和 model config。

主要职责：

- `createAgent()`：合并 Runtime、session、profile 配置，创建或复用 SDK Agent。
- `sendMessage()`：返回 SDK 的流式 `AsyncGenerator<SDKMessage>`。
- `prompt()`：执行一次非流式调用并返回文本。
- `executeTool()`：先做路径访问检查，再通过 Agent 间接调用工具。
- `getMessages()`：把 SDK 消息转换成 shared/UI 使用的消息形状。
- trace replay：从历史 trace 恢复或重放会话，具体实现仍在 `runtime.ts` 内。
- path guard：通过 `setPathAccessChecker()` 注入 Host 层检查器；Runtime 本身不接触 Electron 或数据库。

创建 Agent 时的配置来源大致是：

```text
RuntimeOptions
  + AgentSessionOptions（cwd / workspace / MCP / skills / model）
  + AgentQueryOptions（本轮 profile / capability / tool 覆盖）
  → SDK AgentOptions
```

如果 session 的 Agent 已存在且 trace、model config 没有变化，会复用；否则先关闭旧 Agent 再创建新的。

## 策略链

策略相关代码分成两条相互配合的路径：

1. `classifyProfile.ts`：把用户请求分类为 `general`、`coding`、`office`、`office-pptx`、`file-organizing` 或 `mcp`。模型调用失败、超时或返回非法值时回退到 `general`。
2. `policies/resolver.ts`：根据 profile、capability、模型能力、任务覆盖和用户覆盖，生成最终执行策略，包括工具白名单、最大轮数、工具结果长度、网络和写入路径限制。

`profiles.ts` 是给 SDK 的直接覆盖策略，当前对 `office` 和 `office-pptx` 有专门配置；`policies/resolver.ts` 是更完整的策略解析器。阅读时不要把两者当成同一份配置：前者偏 AgentOptions，后者偏可解释的执行决策。

## 扩展能力

- `mcp.ts`：支持 stdio、SSE、Streamable HTTP；启动 session 前可预安装 `uvx` / 预热 `npx`，设置页可用 `testMcpConnection()` 检查连接并列出工具。
- `skills.ts`：只管理本 Runtime 注册的 Skill。每轮根据 enabled 状态和 mention 名称同步，失活 Skill 会 unregister；结束时调用 `clearRuntimeSkills()`。
- `pathUtils.ts`：从 `path`、`cwd`、`filePath`、`source`、`destination` 等字段提取路径，实际是否允许由注入的 checker 决定。
- `tool-results/transformer.ts`：工具结果过长时保留头尾，中间写入提示；trace 保留原始结果，便于回看。

## 典型调用链

```text
IPC agent handler
  → AgentRuntime.sendMessage(sessionId, content, sessionOptions, queryOptions)
  → ensureAgent / createAgent
  → syncRuntimeSkills + buildQueryOverrides
  → SDK Agent.query()
  → SDKMessage 流
  → Electron IPC 推送给 renderer
```

运行时边界：`agent-runtime` 可以依赖 `shared` 和 `open-agent-sdk`，不能反向依赖 Electron 或 renderer。

## 建议阅读顺序

1. `src/index.ts`：先看公开 API。
2. `src/runtime.ts`：看 session、Agent 生命周期和消息流。
3. `src/profiles.ts`、`src/classifyProfile.ts`：看 profile 从哪里来、如何影响 Agent。
4. `src/policies/resolver.ts`、`src/capabilities/registry.ts`：看工具和风险策略如何合并。
5. `src/mcp.ts`、`src/skills.ts`：看外部工具与 Skill 的接入。
6. `tests/`：按 `index`、`profiles`、`policyResolver`、`mcp`、`skills`、`pathUtils` 对照验证行为。
7. 最后看 `apps/electron/src/ipc/agentHandlers.ts`：确认 Host 层如何调用本库。

## 当前需要特别留意的点

- session、profile、流式逻辑修改时，要同步更新注释和对应测试。
- `bypassPermissions` 下默认不做路径检查；其他权限模式依赖 Host 注入 `PathAccessChecker`。
- session 级 `modelConfig` 会覆盖 Runtime 的模型、API key 和 base URL；没有 model config 时才使用 Runtime 配置。
- `types.ts` 中有历史兼容类型，新的跨进程契约优先放在 `@desktop-agent/shared`。
- 修改导出、工具策略或 trace 相关逻辑后，应运行：

```bash
pnpm --filter @desktop-agent/agent-runtime test
pnpm check
```

