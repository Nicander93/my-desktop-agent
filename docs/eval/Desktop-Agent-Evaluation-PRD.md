# Desktop Agent Evaluation System PRD

## Design Philosophy

Evaluation 的目标不是产生一个漂亮的分数，而是帮助开发者持续优化 Agent。

整个系统的设计优先级应遵循：

``` text
可运行
    ↓
可复现
    ↓
可观测
    ↓
可诊断
    ↓
可比较
    ↓
可自动评测
    ↓
可 Benchmark
```

在项目早期，应优先保证每一步都能为开发者提供真实、有价值的反馈，而不是过早追求复杂评分模型。

------------------------------------------------------------------------

## 我们达成的共识

-   第一阶段不是 Benchmark，而是 Agent 调试实验台。
-   结果（Outcome）重要，但执行路径（Trajectory）同样重要。
-   路径不应只有唯一正确答案。
-   不简单认为"步骤越多越差"，而应关注无效成本。
-   路径数据应首先用于诊断，再逐步沉淀为评测规则。
-   评测体系应采用渐进式演进，而非一次设计完成。

------------------------------------------------------------------------

# 阶段规划

## V0：Agent 调试实验台

目标：

-   能跑任务
-   能重复运行
-   能记录全过程
-   能保存现场
-   能人工复盘

重点：

-   Task Runner
-   Workspace
-   Trace
-   Report
-   Diff
-   Basic Check

## V1：基础自动评测

支持：

-   file exists
-   file contains
-   command
-   snapshot
-   Outcome Score

## V2：过程诊断

关注：

-   Tool 使用
-   重复读取
-   Retry
-   Validation
-   Token
-   Cost

以诊断为主，不急于复杂路径评分。

## V3：对比实验

支持：

-   多模型
-   多 Runtime
-   多 Prompt
-   多次运行
-   成本分析
-   回归检测

## V4：Benchmark

形成：

-   固定任务集
-   固定环境
-   Dashboard
-   Regression
-   Leaderboard

------------------------------------------------------------------------

# V0 详细目标

构建最小可用 Evaluation Harness。

必须做到：

1.  Task 可运行。
2.  Workspace 独立。
3.  Trace 完整。
4.  Result 可保存。
5.  Report 自动生成。
6.  支持重复运行。
7.  支持人工复盘。

## V0 原则

### Repeatability

保证相同任务能够重复运行。

记录：

-   Agent Version
-   Model
-   Provider
-   Tool Version
-   Prompt Version

### Observability

至少记录：

-   Run Start
-   Run End
-   LLM Call
-   Tool Call
-   File Change
-   Error
-   Timeout

### Comparability

能够比较：

-   Success
-   Token
-   Duration
-   Tool Calls
-   Files Changed

### Extensibility

方便增加：

-   Check
-   Task
-   Runtime
-   Model
-   Dashboard

------------------------------------------------------------------------

# 给执行 Agent 的建议

不要拘泥于本文给出的字段和目录。

如果发现更合理的架构，应优先保证：

-   易扩展
-   易维护
-   易调试
-   易分析

而不是完全照搬实现。
