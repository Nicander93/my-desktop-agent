# 评测能力后续路线图

## 目标

v0/v1 已经解决“任务可定义、Agent 可执行、结果可检查、产物可审阅”。下一阶段不急着扩充大量任务，而是先让结果具备可信度、可比较性和可恢复性。

## 业界实现带来的约束

- OpenAI Evals 将评测拆成版本化数据集和评测模板，数据集版本应保持稳定，避免同名实验的数据含义漂移。[OpenAI Evals](https://github.com/openai/evals)、[Build an eval](https://github.com/openai/evals/blob/main/docs/build-eval.md)
- LangSmith 对非确定性 Agent 建议重复执行并记录均值、标准差；每次实验应是不可变、可比较的记录。[Repetitions](https://docs.langchain.com/langsmith/repetition)、[Evaluation concepts](https://docs.langchain.com/langsmith/evaluation-concepts)
- Braintrust 将一次评测明确拆成 Data、Task、Scores，并用不可变 experiment 支持 CI 回归和生产反馈闭环。[Evaluate](https://www.braintrust.dev/docs/evaluate)
- Inspect AI 用稳定 sample ID 支持续跑，重试时复用已完成样本，并保留原 task identity。[Eval logs](https://inspect.aisi.org.uk/eval-logs.html)
- SWE-bench 使用隔离环境执行补丁，并同时检查 fail-to-pass 与 pass-to-pass，防止修复新问题却破坏既有能力。[Evaluation harness](https://www.swebench.com/SWE-bench/api/harness/)
- Promptfoo 支持断言权重、多指标、自定义评分，以及 JSON、HTML、CSV、JUnit 等输出，适合作为报告和 CI 接口的参考。[Assertions](https://www.promptfoo.dev/docs/configuration/expected-outputs/)、[Outputs](https://www.promptfoo.dev/docs/configuration/outputs/)

## 分阶段计划

### M2：可靠性底座（本轮）

- 密钥只用于创建模型客户端，Agent 工具子进程显式清空敏感环境变量。
- `limits.maxTurns` 真正作用于单个任务，而不是被全局 preset 覆盖。
- 超时后等待 Agent 取消完成，再快照、评分和生成 diff。
- checker 超时时终止完整进程树，避免遗留子进程污染后续任务。
- 为超时取消顺序增加回归测试。

验收：`pnpm check` 通过；超时任务不会在评分阶段继续写工作区；任务级轮次限制生效。

### M3：实验管理与统计

- 引入不可变 `experiment.json`：实验 ID、标签、模型配置摘要、Git revision、数据集 hash、开始/结束时间。
- CLI 支持 `--repetitions N`；每个 task/repetition 使用独立目录和稳定 case ID。
- 汇总 pass rate、平均分、耗时、token、成本及标准差，不只展示单次结果。
- 增加 `compare` 命令，对比 candidate 与 baseline，输出新增失败、已修复、分数和成本变化。
- 输出 JUnit，接入 CI；对回归阈值使用显式 gate。

验收：同一数据集重复运行不会覆盖；两次实验可离线比较；CI 能定位到具体失败任务。

### M4：恢复、矩阵与数据治理

- `--resume <experiment>` 按稳定 case ID 跳过已完成样本，仅重跑 error/timeout/未完成项。
- 模型、preset、prompt 版本矩阵运行；控制并发、速率限制和预算上限。
- 任务 schema 增加 dataset version、owner、能力标签、难度和来源；校验 ID 唯一性与 fixture hash。
- 配置指数退避与可恢复错误分类。额度耗尽属于可恢复错误，交互运行提示两小时后重试，自动运行交给外部调度器。

### M5：评分与隔离增强

- 增加测试结果解析、静态分析、diff 约束和部分得分；区分“修复目标测试”和“保持既有测试”。
- 对主观质量引入 rubric/model grader，但保留确定性 checker 作为硬门槛，并校准 grader 一致性。
- 将不可信任务迁移到容器级隔离，默认禁网、限制 CPU/内存/磁盘，并按样本清理。
- 从真实失败中脱敏沉淀任务，形成生产反馈到离线回归集的闭环。

## 执行顺序

M2 → M3 的 experiment/repetitions → M3 的 compare/JUnit → M4 resume/矩阵 → M5。每个阶段先保证产物 schema 可向后读取，再扩展 CLI，避免报告格式频繁失效。
