# DWB v1：面向 Coding Agent 的实施计划

## 0. 执行要求

请先阅读：

- `packages/shared/src/types/evaluation.ts`
- `packages/agent-eval/src/task.ts`
- `packages/agent-eval/src/runner.ts`
- `packages/agent-eval/src/verifier.ts`
- `packages/agent-eval/src/collection.ts`
- `packages/agent-eval/src/report.ts`
- `benchmarks/README.md`
- 现有 `coding-*`、`office-*` 任务

不要创建第二套 Runner。所有工作必须落在现有 `packages/agent-eval` 与 `benchmarks/tasks` 中。

## PR 1：DWB 元数据与目录约定

目标：

- 新增 `docs/eval/dwb/`；
- 增加 `metadata.yaml` 的类型和加载器，但不改变 task.json v1；
- collection/report 可按 `dwb domain difficulty` 聚合；
- 不影响现有任务。

验收：

- 无 metadata 的旧任务仍可运行；
- metadata 错误只给出清晰错误，不导致其他任务无法加载；
- 单元测试覆盖加载、缺省和非法值。

## PR 2：Seed Task DP-001

实现 Messy CSV Cleaner：

- 公开 fixture；
- hidden fixture；
- verifier 脚本；
- 两个故障实现 fixture，用于确认 Verifier 能拒绝；
- README 和运行命令。

优先通过 `verifier.commands` 完成语义验证，不急于扩展核心 Verifier。

## PR 3：Seed Task FM-002

实现 Safe Batch Rename：

- dry-run；
- apply；
- 冲突；
- rollback；
- 输入哈希；
- 不允许删除和覆盖。

本 PR 同时补齐目录级 input integrity helper。

## PR 4：Seed Task SD-001

基于一个小型真实风格仓库构造 issue：

- bug 可复现；
- 测试保护；
- 最小 patch；
- build/test；
- diff 范围约束。

保持和现有 `coding-bugfix-basic` 的区别：新任务应有多文件上下文和边界用例。

## PR 5：Seed Task OA-001

实现 Excel Dashboard：

- 提供输入数据；
- 要求源数据 Sheet、清洗 Sheet、汇总 Sheet、图表；
- 使用脚本读取 OOXML 验证工作簿结构、公式和图表引用；
- 不只检查文件存在。

## PR 6：Seed Task KW-002

实现 Meeting Minutes：

- 转写稿含讨论、决定、模糊表达和未分配事项；
- verifier 通过 evidence IDs 检查关键行动项；
- 不要求逐字匹配摘要；
- 严格拒绝臆造负责人和日期。

## PR 7：Seed Task SA-002

实现 Service Log Diagnosis：

- 提供多份日志和事件清单；
- 真实根因由时间线和错误证据共同确定；
- verifier 检查事实、证据定位和事实/推断区分；
- 不要求唯一措辞。

## PR 8：Repeat 与诊断

新增：

```bash
pnpm eval -- --task ... --repeat 5
pnpm eval -- --task ... --diagnose
pnpm eval:report -- --group-by domain,difficulty
```

诊断模式：

- Golden Task 失败；
- 查 metadata 中 diagnostics；
- 顺序执行 D0/D1；
- 输出最早失败能力；
- 不把诊断子任务分数混入主榜。

## PR 9：Structured Verifier v1

只有在前 6 个任务均稳定后实施：

- json-value；
- csv-table；
- directory-manifest；
- zip/openxml-valid；
- input-tree-unchanged；
- no-out-of-scope-write。

迁移 Seed Tasks，减少重复 verifier 脚本，但保留脚本扩展接口。

## PR 10：Wave 2

从任务目录选择 8–10 个 D2：

- PP-001
- KW-001
- DP-002
- SD-002
- OA-002
- FM-003
- MP-001
- CM-003
- BW-001
- SA-001

## Definition of Done

- 36 个任务均有设计文档和 metadata 草案；
- 6 个 Seed Tasks 可真实运行；
- 每个 Seed Task 有 hidden variant；
- 每个 Seed Task 有参考实现；
- 每个 Seed Task 至少有两个 mutation/fault 实现被拒绝；
- 同任务重复 5 次可统计；
- 能按 failure stage 定位失败；
- 旧任务和现有 CLI 无回归；
- README 包含本地模型运行示例。

## Coding Agent 最终提示词

阅读仓库现有评测代码和本目录全部文档，然后严格按 PR 1～PR 10 顺序执行。先完成当前 PR 的分析、实现、测试和真实运行，再进入下一 PR。不要一次性生成 36 个空任务目录，不要创建平行 Runner，不要为了任务定义提前重构 Runtime。

每次完成一个 PR，输出：

1. 现状分析；
2. 设计决策；
3. 修改文件；
4. 自动测试结果；
5. 实际 benchmark 运行结果；
6. 已知限制；
7. 下一 PR 的前置条件。

遇到文档与实际代码不一致时，以代码为准，并更新设计文档说明偏差。
