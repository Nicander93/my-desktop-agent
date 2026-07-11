# Evaluation Harness 建议工程结构

## 设计说明

以下结构不是强制实现，而是建议参考。

Evaluation 应尽量作为独立模块，避免与 Agent Runtime 强耦合。

``` text
project-root/
│
├── agent/
├── runtime/
├── tools/
├── desktop/
│
├── evaluation/
│   ├── tasks/
│   │   ├── coding/
│   │   ├── office/
│   │   ├── filesystem/
│   │   └── shell/
│   │
│   ├── runner/
│   ├── workspace/
│   ├── trace/
│   ├── reports/
│   ├── checkers/
│   ├── datasets/
│   └── runs/
│
└── docs/
```

## 建议职责

### tasks

维护所有 Benchmark Task。

### runner

统一运行入口。

负责：

-   初始化 Workspace
-   启动 Agent
-   收集结果
-   执行 Checks

### workspace

保证每次运行环境一致。

### trace

统一事件模型。

建议记录：

-   llm_call
-   tool_call
-   tool_result
-   file_change
-   error
-   run_start
-   run_end

采用 JSONL。

### reports

生成 Markdown 报告。

同时支持未来 Dashboard。

### checkers

实现各种 Check。

例如：

-   file_exists
-   file_contains
-   command
-   snapshot

### datasets

维护 Benchmark 数据集。

### runs

保存每一次运行。

建议：

``` text
runs/
    20260710_001/
        task.yaml
        trace.jsonl
        result.json
        report.md
        diff.patch
        workspace/
```

## 长期演进

``` text
Task
    ↓
Runner
    ↓
Trace
    ↓
Check
    ↓
Diagnostics
    ↓
Comparison
    ↓
Benchmark
```

整个系统最终应形成：

-   可运行
-   可观测
-   可诊断
-   可比较
-   可持续优化

而不仅仅是生成一个最终分数。
