# Desktop Workload Benchmark v1：总体设计

## 1. 定位

Desktop Workload Benchmark（DWB）用于持续优化 `my-desktop-agent`，不是给语言模型做知识考试。

核心执行链：

```text
真实用户目标
→ Agent 检查工作区
→ 自主规划与选择工具
→ 生成或修改产物
→ 实际执行
→ Verifier 检查最终状态
→ 失败阶段归因
→ 优化 Runtime / Profile / Capability / Tool
```

v1 设计 12 个公共工作领域、36 个 Golden Tasks。任务不围绕某一职业，而覆盖普通个人用户、知识工作者、办公室人员、开发者和系统管理员常见的电脑工作。

## 2. 与当前仓库的结合

仓库当前已经具备：

- `benchmarks/tasks/<task-id>/task.json + fixture + expected`；
- `packages/agent-eval` 负责加载、隔离执行和验证；
- Task Schema v1 包含 `profile`、`capabilities`、`workflowId`、`suite`、`fixture`、`verifier` 和 `limits`；
- Verifier 已支持：
  - requiredFiles；
  - unchangedPaths；
  - commands；
  - file-exists；
  - file-contains；
  - snapshot；
- 结果已保存 workspace、trace、diff 和 result 路径。

因此本计划采用增量扩展：

1. 保留现有 `EvaluationTask` v1；
2. 首批任务尽量通过 `verifier.commands` 调用任务自带测试脚本；
3. 待 6 个 Seed Tasks 跑通后，再扩展 Structured Verifier；
4. 不先建立复杂插件体系；
5. 不要求 Agent 采用固定语言或实现路径。

## 3. Benchmark 借鉴原则

- SWE-bench：真实仓库、真实问题、测试驱动验收；
- Terminal-Bench：端到端终端任务、独立环境、人工参考解和综合测试；
- OSWorld：初始状态配置、多应用工作流、执行后状态验证；
- SpreadsheetBench：真实论坛需求、同一问题使用多个数据变体，避免针对单个文件写死。

DWB 不直接复制这些题目，而是吸收其可复现、执行式验证和真实工作负载设计方法。

## 4. 任务分级

### D0：基础链路

只用于 Runner、工具和基础 Verifier 的 smoke test。

### D1：单一工作目标

5–10 个有效动作，主要用于能力诊断。

### D2：中等真实任务

10–25 个有效动作，至少包含检查、执行、验证和一个异常分支。v1 的主要目标。

### D3：跨产物工作流

多个输入和多个产物之间存在数据一致性约束。用于后续能力上限测试。

## 5. 12 个领域

1. Personal Productivity
2. Knowledge Work
3. Data Processing
4. Software Development
5. Office Automation
6. File Management
7. Media Processing
8. Internet Workflow
9. Communication
10. Business Workflow
11. System Administration
12. Cross-Application Workflow

每个领域首版 3 个任务，后续每个任务扩展成任务族：

```text
D0 原子能力
→ D1 诊断任务
→ D2 Golden Task
→ D2-H 隐藏数据变体
→ D3 跨应用版本
```

## 6. 首批实施范围

不要一次实现 36 个任务。

Wave 1 只完成 6 个 Seed Tasks：

- DP-001 Messy CSV Cleaner
- FM-002 Safe Batch Rename
- SD-001 Real Repository Bug Fix
- OA-001 Excel Analysis Dashboard
- KW-002 Meeting Minutes
- SA-002 Service Log Diagnosis

这 6 个任务覆盖：

- 结构化数据；
- 文件安全；
- 仓库修改；
- Office 产物；
- 文本知识工作；
- 诊断分析。

## 7. 成功门槛

每个 Golden Task：

- 参考实现通过；
- 两个故障实现能够被 Verifier 拒绝；
- 至少一个隐藏数据变体；
- 输入保护通过；
- 不依赖 Agent 最终自述；
- 连续运行 5 次至少通过 4 次，才标记 `stable`。

整个 Wave 1：

- 6 个任务全部可运行；
- 现有 benchmark 无回归；
- 报告能按 domain、difficulty、failure stage 汇总；
- 本地模型和远程模型使用同一任务定义。
