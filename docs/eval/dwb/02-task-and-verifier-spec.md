# DWB v1：Task、Fixture 与 Verifier 规范

## 1. v1 兼容策略

当前仓库的 `EvaluationTask` 使用 `schemaVersion: 1`。首批任务不立即升级 Schema，而是：

- 使用已有字段表达可执行部分；
- 将扩展元数据放在任务目录中的 `metadata.yaml`；
- 通过 `verifier.commands` 运行任务目录内的确定性测试；
- 等 Wave 1 稳定后，再评估 `schemaVersion: 2`。

这样避免在任务尚未验证前同时大改 Runner、Schema 和 Verifier。

## 2. 单任务目录

```text
benchmarks/tasks/<task-id>/
├── task.json
├── metadata.yaml
├── README.md
├── fixture/
│   ├── input/
│   ├── workspace-files/
│   └── tests/
├── verifier/
│   ├── verify.mjs
│   └── assertions/
└── expected/            # 仅在稳定快照确有价值时使用
```

隐藏输入建议放在：

```text
benchmarks/hidden-fixtures/<task-id>/<variant-id>/
```

Runner 在执行 Agent 后再将 hidden fixture 注入临时验证目录，Agent 工作期间不得读取该目录。

## 3. task.json 示例

```json
{
  "schemaVersion": 1,
  "id": "DP-001",
  "version": "1.0.0",
  "title": "Messy CSV Cleaner",
  "prompt": "客户给了你一份格式混乱的订单 CSV。请检查数据，清理后输出可复用结果和质量报告。不要修改原始输入。",
  "profile": "coding",
  "capabilities": [
    "filesystem-read",
    "filesystem-write",
    "shell",
    "code",
    "verification"
  ],
  "workflowId": "inspect-implement-run-verify",
  "suite": "quality",
  "tags": ["dwb", "data-processing", "D2"],
  "fixture": "fixture",
  "limits": {
    "maxTurns": 30,
    "timeoutMs": 900000,
    "maxChangedFiles": 20
  },
  "verifier": {
    "requiredFiles": [
      "output/cleaned.csv",
      "output/invalid_rows.csv",
      "output/report.json"
    ],
    "unchangedPaths": [
      "input/orders.csv",
      "tests/verify.mjs"
    ],
    "commands": [
      {
        "command": "node",
        "args": ["tests/verify.mjs"],
        "expectedExitCode": 0,
        "stdoutIncludes": ["DWB_VERIFY_PASS"],
        "timeoutMs": 120000
      }
    ]
  }
}
```

`profile` 暂时映射现有 Runtime Profile。若仓库尚未支持 `utility`、`office` 等 profile，首批任务使用现有最接近配置，并依赖 capabilities 明确声明。

## 4. metadata.yaml

```yaml
benchmark: dwb
domain: data-processing
difficulty:
  level: D2
  planningDepth: 3
  toolDiversity: 3
  stateDependency: 4
  inputAmbiguity: 3
  verificationDifficulty: 4
  recoveryDemand: 2
frequency: weekly
risk: medium
sourceType: synthesized-from-common-workflow
expectedArtifacts:
  - output/cleaned.csv
  - output/invalid_rows.csv
  - output/report.json
diagnostics:
  - DP-001-D0
  - DP-001-D1A
  - DP-001-D1B
```

## 5. Verifier 设计

### Hard checks

决定任务是否通过：

- 文件或目录存在；
- 输入文件未改变；
- 结构化数据语义正确；
- Office/PDF 文件可打开；
- 关键数字和关系正确；
- 无越界写入；
- 生成工具可在隐藏输入上运行；
- 命令退出码正确。

### Soft checks

只用于分析，不直接决定通过：

- 工具调用数量；
- 是否 read-before-write；
- 修改文件数量；
- 重试次数；
- 最终说明完整度；
- 耗时和 token。

### 不应作为 Hard check

- 固定代码文件名；
- 固定实现语言；
- 固定函数名；
- 与行为无关的代码风格；
- Agent 自称“已完成”；
- 与任务无关的主观美学。

## 6. Hidden Variants

每个 D2 任务至少包含：

1. 文件名变化；
2. 数据值变化；
3. 一种边界输入；
4. 一种非法输入；
5. 参数变化或目录层级变化。

隐藏验证应优先调用 Agent 生成的通用工具，而不是只核对公开 fixture 的最终文件。这能有效拒绝写死答案的实现。

## 7. 输入安全

在 Runner 创建 baseline 后记录：

- 相对路径；
- 文件类型；
- 文件大小；
- SHA256；
- 是否受保护。

验证结束比较：

- protected 文件是否修改；
- 是否删除输入；
- 是否在 workspace 之外写入；
- 是否覆盖已有目标；
- 文件管理任务是否存在不可逆操作。

## 8. 失败阶段

建议将现有 `failure.category` 保留，并新增分析层字段：

```text
environment
task-understanding
input-inspection
planning
tool-selection
implementation
execution
verification
recovery
safety
delivery
unknown
```

v1 可先由结果分析器根据 verifier check、trace 和 diff 推导，不必立即修改核心结果 Schema。
