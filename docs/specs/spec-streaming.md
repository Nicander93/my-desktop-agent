# Agent 流式输出实现 Spec

> 状态：**已落地**（SDK `stream` + `partial_message`；runtime / UI 已接）  
> 最后更新：2026-07-26  
> 关联：`docs/specs/v0.md`、对话 UI

---

## 1. 背景

产品期望模型回复逐字/逐段流出。早期实现曾是整段到达；根因在 Provider 非流式 HTTP。现已在 Runtime 侧接入流式 Provider，并透传 `partial_message`。

## 2. 当前实现（代码真相）

| 层级 | 现状 |
|------|------|
| Runtime | `AgentRuntime` 使用 `stream: true`；`streaming-openai-provider.ts` 读 SSE |
| SDK | 支持 partial / stream 事件进入 agent loop |
| IPC | `agent:stream-message` 向 renderer 推送 |
| Renderer | 监听流式事件，处理 `partial_message` 与完整 `assistant` |

## 3. 目标（已满足的部分）

- 文本回复可 token/chunk 级更新
- 工具调用等多轮过程事件仍可透传
- 不绕开 `@codeany/open-agent-sdk` 的 agent loop / tools / MCP

## 4. 剩余边角

审阅时关注：

- 超时 / 取消与最后几帧 partial 的时序
- 工具结果很大时 UI 是否仍保持可读
- 与评测无头路径的差异（eval 主要看 Verifier，不依赖 UI 流式）

已知评测侧超时 cancel 竞态见 [Evaluation-Roadmap-v2.md](../eval/Evaluation-Roadmap-v2.md) 与 [archive/Code-Review-v0-v1.md](../eval/archive/Code-Review-v0-v1.md)。

## 5. 历史方案记录（已选型）

曾讨论：Streaming Provider（采用）、独立聊天 API（否）、假打字机（否）、等上游（否）。细节以 git 历史中旧稿为准；本文不再展开未采用方案。
