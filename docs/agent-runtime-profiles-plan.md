# Agent Runtime Profile 改造计划

## 背景

当前 Runtime 更接近通用 Coding Agent：每轮由模型决定下一步工具调用，工具结果再进入下一轮上下文。这个模式通用性强，但在 Office/PPT 这类高频桌面任务中容易出现以下问题：

- 工具集合过大，模型在 30+ 工具中决策，任务容易发散。
- Skill 通过 `Skill` 工具按需加载，会多一轮模型调用，并把完整 Skill 文档写入上下文。
- 大型 `help --json`、batch 执行结果、错误报告会原样进入历史，导致后续每轮输入 token 急剧膨胀。
- Office CLI 的命令细节由模型手写，容易出现 `batch` 参数顺序、JSON schema 等低级错误，进而触发重写全量 batch 的循环。

目标不是给 PPT 写死逻辑，而是给 Runtime 增加“任务 Profile + 工具策略”能力，让常见任务走更窄、更快、更可控的路径。

## 目标

1. 保持桌面 Agent 的通用能力，不破坏现有 Coding / MCP / 文件任务。
2. 对 Office 类任务启用快速执行策略，减少无效轮次和上下文膨胀。
3. 建立可扩展 Profile 机制，后续可支持 `coding`、`file-organizing`、`mcp` 等场景。
4. 让工具结果进入模型前可按 Profile 压缩，避免大 JSON 反复进入上下文。
5. 最终用专用 wrapper 工具封装高频外部 CLI，降低模型手写命令的错误率。

## 非目标

- 不重写 `@codeany/open-agent-sdk` 的完整 agent loop。
- 不把 Office/PPT 逻辑硬编码到 UI 层。
- 不在第一阶段实现复杂意图分类模型，先用规则识别。
- 不追求第一版覆盖 officecli 全部能力，只覆盖创建/批处理/查看/校验的高频路径。

## 设计方向

### Runtime Profile

新增 Profile 概念：

```ts
type RuntimeProfile = 'general' | 'office' | 'coding' | 'file-organizing' | 'mcp';
```

Profile 由用户输入、显式 Skill/MCP mention、文件类型、当前工作区上下文共同决定。第一版使用简单规则：

- 包含 `ppt`、`pptx`、`powerpoint`、`演示文稿`、`word`、`docx`、`excel`、`xlsx`、`officecli` 时进入 `office`。
- 包含代码修复、测试、构建、重构等关键词时保持 `coding` 或 `general`。
- 用户显式指定时优先用户指定。

### Profile Policy

每个 Profile 对应一组 Runtime overrides：

```ts
interface RuntimeProfilePolicy {
  profile: RuntimeProfile;
  maxTurns?: number;
  thinking?: RuntimeOptions['thinking'];
  allowedTools?: string[];
  disallowedTools?: string[];
  appendSystemPrompt?: string;
  toolResultPolicy?: ToolResultPolicy;
}
```

Office 第一版策略：

```ts
{
  profile: 'office',
  maxTurns: 8,
  thinking: { type: 'disabled' },
  allowedTools: ['Bash', 'Read', 'Write', 'Edit'],
  appendSystemPrompt: officeFastPathPrompt,
  toolResultPolicy: {
    maxChars: 4000,
    summarizeJson: true
  }
}
```

## Office Fast Path Prompt

Office profile 不注入完整 `SKILL.md`，而注入短提示：

```text
你正在处理 Office 文档任务。

如果创建 PPT：
1. 如需 PPT 专用规则，运行：officecli load_skill pptx。
2. load_skill 是 officecli CLI 命令，不是 Agent Skill 工具。
3. 只读取必要 help，禁止原样读取完整 --json schema。
4. 生成 batch JSON 到文件。
5. 创建目标 pptx。
6. 执行：officecli batch "目标.pptx" --input "batch.json" --json。
7. 若失败，只根据前 5 条错误做最小修复。
8. 成功后只做一次 stats / outline / validate。

禁止：
- 调用 Agent Skill("pptx")。
- 执行 officecli batch "batch.json" --json。
- 无错误时多次重写完整 batch JSON。
- 将大型 schema / help / batch 结果原样带入上下文。
```

## 工具结果压缩

新增工具结果压缩层，在 tool result 进入下一轮模型消息前处理：

```ts
interface ToolResultPolicy {
  maxChars: number;
  summarizeJson?: boolean;
  preserveHeadTail?: boolean;
}
```

Office profile 的 JSON 结果处理：

- `success: true`：保留 `success`、关键计数、`outputFile`、简短 summary。
- `success: false`：保留前 5 条错误的 `index`、`error`、`item.command`、`item.type`。
- 普通文本超过阈值时截断到头尾摘要。
- `officecli help ... --json` 结果只保留命令/属性名称摘要，不保留完整 schema。

这层能力应设计成通用机制，后续也可用于 `grep` 大结果、测试日志、构建日志。

## OfficeCliTool

中期新增专用工具，而不是让模型直接拼 PowerShell：

```ts
type OfficeCliAction =
  | 'loadSkill'
  | 'create'
  | 'batch'
  | 'view'
  | 'validate'
  | 'close';
```

示例输入：

```json
{
  "action": "batch",
  "file": "MCP介绍.pptx",
  "input": "mcp-deck-batch.json"
}
```

工具内部负责执行：

```powershell
officecli batch "MCP介绍.pptx" --input "mcp-deck-batch.json" --json
```

并负责：

- 命令格式校验。
- 工作目录解析。
- JSON 结果解析。
- 错误摘要。
- 超时控制。
- 必要时返回机器可读错误码。

这样模型只提供结构化参数，不再记忆 `officecli batch` 的细节。

## 分阶段计划

### Phase 1：Profile 骨架

- 增加 `RuntimeProfile`、`RuntimeProfilePolicy` 类型。
- 在 Electron 主进程发送消息前做简单 profile 识别。
- `AgentQueryOptions` 增加 profile/overrides 相关字段。
- `AgentRuntime.buildQueryOverrides()` 支持合并 profile prompt、allowedTools、thinking、maxTurns。

验收：

- Office 任务能自动进入 `office` profile。
- 非 Office 任务仍走现有 general 行为。
- Trace 中能看到实际 maxTurns、thinking、工具集变化。

### Phase 2：Office Fast Path

- 新增 `officeFastPathPrompt`。
- Office profile 默认关闭 thinking，限制工具集。
- 明确 `officecli load_skill pptx` 与 Agent Skill 的区别。
- 对 `/officecli` 或 Office 任务避免先调用 `Skill` 工具加载完整文档。

验收：

- 创建简单 PPT 不再调用 `Skill("pptx")`。
- 不再读取完整 `officecli help pptx shape --json`。
- 简单 PPT 的目标轮数控制在 6-8 轮。

### Phase 3：工具结果压缩

- 在 Runtime 或 SDK wrapper 层增加 tool result 压缩。
- 对 JSON 结果实现成功/失败摘要。
- 对超长文本实现 profile 级阈值截断。
- Trace UI 保留原始结果查看入口时，模型上下文只使用压缩结果。

验收：

- Office 任务后期单轮 input tokens 不再因为 help/schema/batch 结果膨胀到数万。
- batch 失败时模型只看到前几条关键错误，而不是全量结果。

### Phase 4：OfficeCliTool

- 新增专用工具定义。
- 支持 `loadSkill`、`create`、`batch`、`view`、`validate`。
- Office profile 优先开放 `OfficeCli`，逐步减少直接 Bash 使用。

验收：

- 模型不能再生成错误形式 `officecli batch "batch.json" --json`。
- batch 执行失败时返回结构化摘要。
- 简单 PPT 任务可稳定在 1-3 分钟内完成。

### Phase 5：通用化

- 将 `office` profile 的机制抽象给其他场景复用。
- 为 coding/file/mcp 逐步定义不同工具集、thinking、结果压缩策略。
- 在设置页暴露 profile 调试信息和可选开关。

## 风险

- 过度限制工具可能导致某些复杂 Office 任务缺能力，需要允许 profile fallback 到 general。
- 关闭 thinking 可能降低复杂内容策划质量，可用 `adaptive` 作为中间档。
- 压缩工具结果可能丢失调试细节，需要 Trace 保存原始结果，模型上下文使用摘要。
- OfficeCliTool 第一版不要覆盖过大，避免做成另一个复杂 SDK。

## 推荐优先级

1. Profile 骨架 + Office Fast Path。
2. 工具结果压缩。
3. OfficeCliTool。
4. 扩展到其他任务 Profile。

这条路径能先解决当前 PPT 任务慢的问题，同时保留桌面 Agent 的通用架构。
