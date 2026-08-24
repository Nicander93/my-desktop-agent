# Agent Runtime

Agent Runtime 项目。目前已实现 Tool 层；session、profile、MCP 和流式链路尚未接入。

## 当前结构

```text
src/
├── core/          # Tool 协议、执行上下文、权限与可预期错误
├── registry/      # Tool 集合与注册表
├── tools/general/ # Read、Write、Edit、Glob、Grep
└── utils/         # 无状态的路径、文件、进程与限额辅助函数
```

Tool 返回结构化结果；面向模型的 schema、结果格式化与 Agent loop 集成留给后续阶段。
搜索工具通过运行时上下文注入 `rg` 路径，并以 `shell: false` 启动子进程。

## 验证

```bash
pnpm --filter @desktop-agent/agent-runtime-new build
pnpm --filter @desktop-agent/agent-runtime-new test
```
