# Agent Runtime (new)

这是新版通用 Agent Runtime 的渐进式项目骨架。目录先表达职责边界，具体契约和行为将在后续结对编程中逐个确定。

```text
src/
├── agent/      # agent、agent-loop、event
├── core/       # message、tool、permission、context
├── llm/        # provider、llm、openai-compatible
└── tools/      # registry、executor、specific tools、tool utils
```

目标依赖方向为 `tools / llm -> agent`，其余的 Core 协议由各职能模块使用。应用层负责组合 Runtime，不在本层提供具体持久化实现。

## 当前进度

- 原有 Read、Write、Edit、Glob、Grep、AgentLoop 与 Tool Executor 保持不变。
- `agent/` 中的 `agent.ts`、`event.ts` 和 `state.ts` 暂时保留为占位文件。
- `tools/filesystem` 与 `tools/search` 通过薄转发复用现有工具；Bash 与 SubAgent 只占位。
- SubAgent 的目录归属固定为 Tool，不建立独立架构层。

当前源码统一按职责分布在 `agent/`、`core/`、`llm/` 与 `tools/` 下；新增代码应保持该分层。

## 验证

```bash
pnpm --filter @desktop-agent/agent-runtime-new build
pnpm --filter @desktop-agent/agent-runtime-new test
```

## LLM

```ts
import { LLM, listModels } from "@desktop-agent/agent-runtime-new";

const llm = new LLM({
  provider: "ollama",
  model: "qwen3",
});

const response = await llm.generate({
  messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
  tools: [],
});
```

所有当前 Provider 都通过同一个 OpenAI-compatible client 访问：

```ts
const hosted = new LLM({
  provider: "openrouter",
  model: "qwen/qwen3.5",
  apiKey,
});

const custom = new LLM({
  provider: "openai-compatible",
  model: "my-model",
  baseURL: "http://localhost:8000/v1",
});
```

`stream()` 逐步返回文本增量，并以完整的 `response` 事件结束；tool call 在最终响应中提供。

可用模型通过共享的 Provider 配置查询：

```ts
const models = await listModels({ provider: "openrouter", apiKey });
```

reasoning 字段兼容和重试策略将在后续增量中单独设计。
