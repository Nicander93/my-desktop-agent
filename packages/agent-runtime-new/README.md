# Agent Runtime (new)

这是新版通用 Agent Runtime 的渐进式项目骨架。目录先表达职责边界，具体契约和行为将在后续结对编程中逐个确定。

```text
src/
├── core/       # Agent、AgentLoop、AgentState、AgentContext、AgentEvent、AgentTool
├── services/   # session、context、permission、execution、persistence、compaction、queue、tool
├── tools/      # filesystem、search、shell、agent
├── model/      # 模型与消息协议端口
└── utils/      # 无状态的路径、文件、进程与限额辅助函数
```

目标依赖方向为 `tools / services -> core`。应用层负责组合 Runtime；Core 不依赖 Electron、React 或具体持久化实现。

## 当前进度

- 原有 Read、Write、Edit、Glob、Grep、AgentLoop 与 Tool Executor 保持不变。
- `core/` 中新增的 Agent、State、Context、Event 文件目前只占位。
- `services/` 仅放置最小接口或转发入口，不提供具体运行机制。
- `tools/filesystem` 与 `tools/search` 通过薄转发复用现有工具；Bash 与 SubAgent 只占位。
- SubAgent 的目录归属固定为 Tool，不建立独立架构层。

旧的 `agent/`、`registry/`、`tools/general/` 路径暂时作为内部兼容层保留；新增代码应使用 `core/`、`services/` 与新的工具分组路径。

## 验证

```bash
pnpm --filter @desktop-agent/agent-runtime-new build
pnpm --filter @desktop-agent/agent-runtime-new test
```

## OpenAI-compatible Model

```ts
import { OpenAICompatibleModel } from "@desktop-agent/agent-runtime-new";

const model = new OpenAICompatibleModel({
  baseURL: "http://localhost:11434/v1",
  model: "qwen3",
});

const response = await model.generate({
  messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
  tools: [],
});
```

`OpenAICompatibleModel` 同时实现 `Model` 和 `StreamingModel`。`stream()` 逐步返回文本增量，并以完整的 `response` 事件结束；tool call 在最终响应中提供。

reasoning 字段兼容和重试策略将在后续增量中单独设计。
