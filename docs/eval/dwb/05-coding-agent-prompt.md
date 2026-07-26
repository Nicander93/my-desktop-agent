# 给 Coding Agent 的总执行提示词

你正在为 `Nicander93/my-desktop-agent` 实现 Desktop Workload Benchmark（DWB）。

## 目标

在现有 `packages/agent-eval` 和 `benchmarks/tasks` 基础上，构建覆盖公共桌面工作负载的评测体系。该体系评测的是 Desktop Agent 的端到端工作能力，而非模型知识问答。

## 必读文件

1. `00-overview.md`
2. `01-golden-tasks.md`
3. `02-task-and-verifier-spec.md`
4. `03-implementation-roadmap.md`
5. `04-task-catalog.yaml`
6. 仓库中的 `benchmarks/README.md`
7. `packages/shared/src/types/evaluation.ts`
8. `packages/agent-eval/src/*`

## 强制约束

- 不创建第二套评测框架；
- 保持 `schemaVersion: 1` 和旧任务兼容，除非实施计划明确进入 Schema 升级 PR；
- 通过 Verifier 判断成功，不相信 Agent 自述；
- 不限制任务实现语言；
- 不允许 Agent 读取 hidden fixture 或 expected 答案；
- 输入文件默认保护；
- 文件管理任务默认 dry-run；
- D2/D3 必须实际运行生成工具或验证生成产物；
- 每个任务有参考实现、hidden variant 和故障实现；
- 先实现 6 个 Seed Tasks，不批量创建空壳任务；
- 每个 PR 独立可测试、可回滚；
- 避免大规模重构和过度抽象。

## 首个任务

从 `DP-001 Messy CSV Cleaner` 开始。完成任务目录、fixture、hidden fixture、verifier、参考实现、故障实现和真实运行闭环后，再进入 `FM-002`。

## 输出要求

每个 PR 完成后给出：

- 变更摘要；
- 文件清单；
- 测试命令和结果；
- Benchmark 实际运行结果；
- Verifier 能拒绝哪些错误实现；
- 对 Agent 能力暴露出的失败点；
- 下一步建议。
