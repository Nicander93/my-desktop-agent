# 评测能力后续路线图

## 目标

任务可定义、Agent 可执行、结果可检查、产物可审阅已经具备。下一阶段提升可信度、可比较性和可恢复性。

## 已完成（对照当前代码）

- `packages/agent-eval` + `benchmarks/tasks` 取代旧 `evals/coding/`
- coding smoke / regression / bugfix / office / mario 等任务可跑
- **Desktop Workload Benchmark 36 题**已落地（`pnpm eval:dwb`）
- 旁路 `metadata.yaml`、hidden fixture 钩子（`DWB_HIDDEN_ROOT`）
- CLI：`--tag` / `--domain` / `--difficulty` / `--repeat` / `--diagnose`
- 报告：`pnpm eval:report`，可按 `domain,difficulty` 分组
- `limits.maxTurns` 已作用于单任务；verifier 子进程超时会杀进程树

## 业界约束（仍适用）

- 数据集版本应稳定，避免同名实验数据含义漂移
- 非确定性 Agent 建议重复执行并记录均值/分布
- 实验记录应不可变、可比较；支持续跑与 CI gate

## 剩余计划

### M2 收尾：可靠性

- 密钥只用于创建模型客户端，Agent 工具子进程显式清空敏感环境变量（部分仍依赖 `loadProjectEnv` → `process.env`）
- 超时后等待 Agent 取消完成，再快照、评分和生成 diff（cancel 竞态仍在）
- 为超时取消顺序增加回归测试

### M3：实验管理与统计

- 不可变 `experiment.json`（实验 ID、模型摘要、Git revision、数据集 hash）
- 汇总 pass rate / 耗时 / token 及分布；`compare` 对比 baseline
- JUnit 输出接入 CI

> 说明：`--repeat` 已可重复跑同一任务；完整 experiment/compare 尚未做。

### M4：恢复与矩阵

- `--resume <experiment>` 按稳定 case ID 跳过已完成样本
- 模型 / prompt 矩阵与预算上限

### M5：评分与隔离增强

- Structured Verifier（json-value / csv-table 等），减少任务内重复脚本
- 容器级隔离（默认禁网）
- 从真实失败脱敏沉淀回归集

## 执行顺序

M2 收尾 → M3 experiment/compare → M4 resume → M5 Structured Verifier / 隔离。

操作入口：[benchmarks/README.md](../../benchmarks/README.md)、[docs/eval/README.md](./README.md)。
