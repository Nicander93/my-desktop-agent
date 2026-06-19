# Agent 流式输出实现 Spec

> 状态：讨论中（Draft）  
> 最后更新：2026-06-19  
> 关联：`docs/v0.md`、对话 UI（DeepSeek 文档风格）

---

## 1. 背景与问题

### 1.1 用户期望

- 对话 UI 采用 **DeepSeek 式**：无头像、用户消息轻量气泡、AI 回复文档式排版
- **模型回复应逐字/逐段流出**，而不是等待整段完成后一次性渲染

### 1.2 当前现象

- UI 已支持 `isStreaming` 占位、光标动画、监听 `agent:stream-message`
- 实际体验仍是：**等待数秒 → 整段文字一次性出现**

### 1.3 根因（已确认）

```
Renderer → IPC → AgentRuntime → SDK agent.query()
                                  → QueryEngine
                                    → LLMProvider.createMessage()
                                      → fetch (无 stream: true)
                                      → await response.json()  // 等完整响应
                                  → yield 完整 assistant 消息
                                → main 转发 agent:stream-message
```

| 层级 | 现状 |
|------|------|
| **OpenAIProvider / AnthropicProvider** | 非流式 HTTP，不支持 SSE |
| **QueryEngine** | `includePartialMessages` 传入但未在 engine 内消费 token 级事件 |
| **应用 IPC** | 透传 SDK 原始 `SDKMessage`，无统一流式协议 |
| **Renderer** | 只在收到完整 `assistant` 时更新内容 |

结论：**问题在 Provider / 协议层，不在 UI 是否监听事件。**

---

## 2. 目标

### 2.1 产品目标

- 模型 **文本回复** 真流式（token/chunk 级）
- **全链路事件化**：多轮 agent、工具调用、错误等过程对用户可见，不必等整次 `query` 结束
- **继续基于 `@codeany/open-agent-sdk`**：保留工具池、MCP、session、compact、hooks 等能力

### 2.2 非目标（本 spec 暂不强制）

- 替换 open-agent-sdk
- 简单聊天与 Agent 走两套 API（见方案 B，已否决倾向）

---

## 3. 方案选型（已讨论）

### 3.1 曾考虑的方案

| 方案 | 描述 | 结论 |
|------|------|------|
| A | Streaming Provider + 保留 SDK | **推荐** |
| B | 纯聊天走独立 streaming API，Agent 走 SDK | SDK 能力分裂，不推荐 |
| C | 前端打字机（假流式） | 仅临时凑合，不解决首字延迟 |
| D | 等 SDK 官方支持 | 可作为长期，不解决短期体验 |

### 3.2 选定方向：方案 A

在 **LLMProvider 层** 实现真流式 HTTP，对 QueryEngine **保持 `createMessage()` 接口不变**：

1. 请求 `stream: true`，读 SSE
2. 每个 delta → 推送到 **StreamBus** → UI
3. 流结束 → 组装 `CreateMessageResponse` 返回 Engine（agent 循环、tool_calls 解析不受影响）

**open-agent-sdk 能力保留**：Agent 循环、内置工具、MCP、session、compact、权限等均在 SDK 内，不绕开。

---

## 4. 工具层面是否需要流式？（待决）

工具相关流式分 **两类**，需区分讨论：

### 4.1 LLM 生成工具调用（Tool Call Generation Streaming）

模型在 **决定调用工具、生成 arguments JSON** 时的流式输出。

- OpenAI：`tool_calls[].function.arguments` 的 delta
- Anthropic：`input_json_delta` 等

**性质**：属于 **LLM Provider 流式** 的一部分，不是工具执行本身。

**UI 价值**：可提前展示「正在调用 Read…」「path 正在拼出」，减少「卡住」感。

**建议优先级**：**P1**（随 Provider 流式一起做，成本低）

---

### 4.2 工具执行输出（Tool Execution Streaming）

工具 **真正跑起来之后** 的输出流式，例如：

- `Bash`：stdout/stderr 逐行
- 长任务：build / npm install 日志
- `Read` 大文件：是否分块展示

**性质**：在 SDK **工具 `call()` 实现** 或 **PostToolUse hook** 层产生事件。

**是否需要？**

| 维度 | 分析 |
|------|------|
| 用户价值 | Desktop Agent 跑 shell、构建时体验明显提升 |
| 实现成本 | **高**：需逐个工具支持 stream callback，或包装 spawn stdout |
| SDK 现状 | 多数工具一次性返回 `ToolResult`，无 stream 接口 |
| 与文本流式关系 | **独立能力**，不阻塞 P0 文本流式 |

**建议优先级**：

- **P0**：LLM 文本 delta（必须，解决当前核心痛点）
- **P1**：Tool call 参数生成 delta（Provider 层，建议做）
- **P2**：Tool 执行输出流式（按工具逐步加，Bash 优先）

**结论（倾向）**：

> **工具执行层不作为第一版必做项**；架构上预留 `tool-run-chunk` 事件即可。  
> 若 V0 强调「跑命令看得见输出」，可将 Bash 流式提升为 P1.5。

### 4.3 待产品确认的问题

1. V0 是否必须「命令行实时输出」？
2. 工具卡片 UI：仅展示最终 input/output，还是 execution 过程可折叠流式？
3. 失败/超时工具：流式中断如何展示？

---

## 5. 目标代码结构

```
apps/renderer
  hooks/useAgentStream.ts       # 订阅 AgentStreamEvent，更新 store
  components/chat/              # 按事件类型渲染（文档风 + 工具块）
  stores/chatStore.ts           # turn / assistant.text / toolCalls 状态

apps/electron
  main.ts                       # IPC 入口（薄）
  ipc/agentStream.ts            # runtime 事件 → webContents.send
  preload.ts                    # onAgentEvent / offAgentEvent

packages/shared
  agent-stream.ts               # AgentStreamEvent 类型（IPC 契约）

packages/agent-runtime
  runtime/AgentRuntime.ts       # sendMessage → AsyncIterable<AgentStreamEvent>
  streaming/
    StreamBus.ts                # 按 sessionId 发布/订阅
    StreamAdapter.ts            # SDKMessage + ProviderDelta → AgentStreamEvent
    types.ts
  providers/
    StreamingOpenAIProvider.ts  # DeepSeek / OpenAI 兼容 SSE
    StreamingAnthropicProvider.ts
    createStreamingProvider.ts
  runtime/AgentFacade.ts        # 组装 QueryEngine + StreamingProvider（见 §6）
```

**原则**：

- 流式语义集中在 **agent-runtime**
- Electron 只做 **transport**
- Renderer 只做 **presentation**
- **不把 SDK 原始 `SDKMessage` 直接暴露给 UI**

---

## 6. 统一事件协议：`AgentStreamEvent`

建议定义于 `packages/shared/agent-stream.ts`：

```typescript
type AgentStreamEvent =
  | { type: 'turn-start'; turn: number }
  | { type: 'text-delta'; delta: string }
  | { type: 'text-end' }
  | { type: 'tool-input-delta'; toolCallId: string; delta: string }
  | { type: 'tool-call'; toolCallId: string; name: string; input: unknown }
  | { type: 'tool-run-start'; toolCallId: string; name: string }
  | { type: 'tool-run-chunk'; toolCallId: string; chunk: string }   // P2
  | { type: 'tool-run-end'; toolCallId: string; success: boolean; output?: string }
  | { type: 'error'; message: string }
  | { type: 'done'; usage?: { input: number; output: number } }
```

**StreamAdapter 输入来源**：

| 来源 | 映射事件 |
|------|----------|
| Provider SSE | `text-delta`, `tool-input-delta`, `text-end` |
| SDK `tool_result` | `tool-run-end`（或配合 P2 的 chunk） |
| SDK `result` / 错误 | `done` / `error` |
| 多轮边界 | `turn-start` |

---

## 7. 与 open-agent-sdk 的集成

### 7.1 Provider 注入问题

SDK `Agent` 内部写死 `createProvider()`，**暂无 `AgentOptions.provider` 注入点**。

| 路径 | 说明 | 倾向 |
|------|------|------|
| **上游 PR** | SDK 增加 `customProvider?: LLMProvider` | 长期最干净 |
| **AgentFacade** | agent-runtime 用导出的 `QueryEngine` + tools 自行组装 | 短期可行 |
| **Fork SDK** | monorepo 内 `packages/open-agent-sdk` | 维护成本高 |

**建议**：短期 **AgentFacade** + 长期推动 SDK PR。

### 7.2 Streaming Provider 行为

```typescript
interface LLMProvider {
  createMessage(params): Promise<CreateMessageResponse>
}

// StreamingOpenAIProvider 内部：
async createMessage(params) {
  // 1. fetch stream: true
  // 2. 每 delta → streamBus.emit(sessionId, { type: 'text-delta', ... })
  // 3. 流结束 → 返回完整 CreateMessageResponse（含 tool_calls）
}
```

QueryEngine 无感知；用户在 `await` 期间已通过 StreamBus 看到输出。

---

## 8. 数据流（目标态）

```
User input
  → AgentRuntime.sendMessage(sessionId, content)
      → AgentFacade.query()
          → QueryEngine loop
              → StreamingProvider.createMessage() ──→ StreamBus
              → tool.call() [P2 可选] ────────────→ StreamBus
          → SDK yield ──→ StreamAdapter ──────────→ StreamBus
      → yield AgentStreamEvent
  → IPC agent:event
  → useAgentStream → chatStore
  → UI
```

---

## 9. 当前代码基线（已实现，非真流式）

以下改动改善 UI/健壮性，**未解决 token 级流式**：

| 文件 | 内容 |
|------|------|
| `apps/renderer/.../MessageItem.tsx` | DeepSeek 风 UI，无头像 |
| `apps/renderer/.../useAgent.ts` | 占位消息、`onStreamMessage`、session 修复 |
| `apps/renderer/.../agentMessage.ts` | SDK 消息解析 |
| `apps/electron/src/loadEnvFile.ts` | 主进程加载 `.env` |
| `packages/agent-runtime/runtime.ts` | `includePartialMessages: true`（当前 SDK 下无效） |
| `apps/electron/src/preload.ts` | 流式监听可 unsubscribe |

---

## 10. 实施阶段建议

### Phase 0 — 协议与骨架

- [ ] `packages/shared/agent-stream.ts` 定义 `AgentStreamEvent`
- [ ] `StreamBus` + `StreamAdapter` 骨架
- [ ] IPC：`agent:event` 替代/raw 透传 `SDKMessage`
- [ ] Renderer `useAgentStream` 消费新协议

### Phase 1 — P0 文本真流式

- [ ] `StreamingOpenAIProvider`（DeepSeek `stream: true` + SSE parser）
- [ ] `AgentFacade` 注入 Streaming Provider
- [ ] UI：`text-delta` 追加渲染

### Phase 2 — P1 工具调用生成流式

- [ ] Provider 解析 `tool_calls` delta → `tool-input-delta` / `tool-call`
- [ ] UI：工具卡片「生成中」状态

### Phase 3 — P2 工具执行流式（可选）

- [ ] 预留 `tool-run-chunk` 消费逻辑
- [ ] Bash（或 wrap spawn）优先实现 execution streaming
- [ ] 评估是否 hook SDK 全部工具 vs 仅高频工具

### Phase 4 — Anthropic 与其它

- [ ] `StreamingAnthropicProvider`
- [ ] 思考块 / content block 流式（若产品需要展示）

---

## 11. 开放问题（新对话继续）

1. **AgentFacade vs 等 SDK PR**：第一版选哪条？是否接受短期 glue 代码？
2. **事件类型定义在 `shared` 还是仅 runtime**：renderer 类型共享策略
3. **IPC 单频道 `agent:event` vs 多频道**：倾向单频道
4. **工具执行流式是否进 V0 必做**：见 §4.3
5. **多轮 agent 时 UI 模型**：单条 assistant 追加 vs 每 turn 分段
6. **流式中断/取消**：AbortController 与 UI stop 按钮
7. **Markdown 渲染**：流式过程中是否增量 parse（性能与闪烁）

---

## 12. 环境变量与 Vite 说明（备忘）

- API Key 仅在 **Electron 主进程** 使用，不应暴露给 renderer
- Vite `import.meta.env` 仅对 renderer 生效，且通常仅 `VITE_` 前缀
- 主进程通过 `loadEnvFile` 读取项目根目录 `.env`（`CODEANY_*`）
- DeepSeek 文档：https://api-docs.deepseek.com/zh-cn/  
  推荐模型：`deepseek-v4-flash` / `deepseek-v4-pro`（`deepseek-chat` 等为兼容名）

---

## 13. 参考：SDK 相关源码位置

```
node_modules/@codeany/open-agent-sdk/src/
  providers/openai.ts      # 非流式 fetch + json()
  providers/anthropic.ts   # 非流式 messages.create
  engine.ts                # QueryEngine，await provider.createMessage
  agent.ts                 # createAgent，内部 createProvider()
  types.ts                 # SDKMessage, partial_message（engine 未消费）
```

---

## 14. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-06-19 | 初稿：问题根因、方案 A、代码结构、工具流式分层（P0/P1/P2）、开放问题 |
