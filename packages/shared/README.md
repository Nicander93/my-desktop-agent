# @desktop-agent/shared

跨进程与跨包的纯契约层：IPC payload、MCP/Skill、附件、trace、Runtime Profile 和评测类型都放在 `src/types/`。本包不得依赖 Electron、React、`agent-runtime` 或 `open-agent-sdk`；业务实现应留在各自的层。

## 放置规则

- 新增 IPC 请求/响应结构：先在此定义，再同步 Electron handler、`preload.ts` 和 renderer `electron.d.ts`。
- Renderer 所需的 Agent trace、消息解析或 Profile 名称应复用此包，不能复制 Runtime 内部类型。
- `Model Config` 是连接配置，`Runtime Profile` 是任务策略入口，二者不要在共享类型中混为同一字段。
- `src/runtime/` 仅提供跨层可复用的环境/路径契约与纯函数；不读取 `process.env` 以外的 Host 状态。

## 重点入口

- `src/types/mcp.ts`：MCP 配置、Runtime Profile 与发消息选项
- `src/types/trace.ts`：持久化 trace 与 renderer 展示的桥接类型
- `src/types/evaluation.ts`：评测任务、结果与 Verifier 输出
- `src/skills.ts`：Skill 定义和 mention 解析

详细 IPC 同步步骤见 [`contributing/ipc-contract.md`](../../contributing/ipc-contract.md)。
