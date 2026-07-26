# DWB 维护提示（Coding Agent）

36 个 Golden Tasks 已在 `benchmarks/tasks/` 落地。本提示用于**补洞、修 Verifier、加 hidden/faults**，不是从零实现。

## 必读

1. [`benchmarks/README.md`](../../../benchmarks/README.md)
2. [`02-task-and-verifier-spec.md`](./02-task-and-verifier-spec.md)
3. [`03-implementation-roadmap.md`](./03-implementation-roadmap.md)（落地状态）
4. 目标任务目录 `benchmarks/tasks/<ID>/`
5. `packages/agent-eval/src/*`

## 约束

- 不创建第二套评测框架；保持 `schemaVersion: 1`
- 成功只认 Verifier（`harness/verify.mjs` + `DWB_VERIFY_PASS`）
- Agent 不可读 `hidden-fixtures/` 与 expected 答案
- capabilities 用现有 Runtime 枚举
- 每个改动的任务：reference PASS、faults FAIL；能的话补/验 hidden
- 避免大规模重构 Runtime

## 常见工作

1. Verifier 过严/过松：改 `harness/verify.mjs`，用 reference/faults 回归
2. 缺 hidden：补 `benchmarks/hidden-fixtures/<ID>/<variant>/`
3. 诊断子任务：补 D0/D1 并写入 `metadata.yaml` 的 `diagnostics`
4. 设计卡与实现偏差：更新 `01-golden-tasks.md` / catalog，或修正任务

## 输出

完成后给出：变更摘要、文件清单、Verifier 自测命令与结果、已知限制。
