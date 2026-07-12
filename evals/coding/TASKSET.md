# v0/v1 编程任务集 / v0/v1 Coding Task Set

首批任务使用小型、自包含的 JavaScript fixture。它们用于评测 Desktop Agent runtime 及其文件、Shell 和工具调用循环，不引入特定 benchmark 基础设施，也不修改本仓库。

The initial task set uses small, self-contained JavaScript fixtures. It evaluates the Desktop Agent runtime and its file, shell, and tool loop without importing benchmark-specific infrastructure or modifying this repository.

| 套件 / Suite | 任务 / Task | 主要能力 / Primary capability | 初始状态 / Baseline state |
| --- | --- | --- | --- |
| smoke | `coding-smoke-001` | 创建模块并验证 / Create and validate a module | 缺少实现 / Missing implementation |
| smoke | `coding-smoke-002` | 根据失败信息修复计算 / Repair a calculation from a failure | 断言失败 / Failing assertion |
| smoke | `coding-smoke-003` | 写入精确的结构化数据 / Write exact structured data | 文件缺失 / Missing file |
| regression | `coding-regression-001` | 处理校验边界情况 / Handle validation edge cases | 解析器过于宽松 / Permissive parser |
| regression | `coding-regression-002` | 不修改输入地转换集合 / Transform collections without mutation | 缺少实现 / Missing implementation |
| regression | `coding-regression-003` | 在嵌套更新中保持不可变性 / Preserve immutability in nested updates | 原地修改 / In-place mutation |

每个修改类任务初始执行 `node verify.mjs` 都会失败，并限制最大修改文件数。任务不要求唯一的源码实现，可执行行为是主要判断依据。JSON 配置任务是例外：请求的输出本身是稳定文档，因此适合验证 v1 snapshot checker。

Each mutation task starts with a failing `node verify.mjs` command and caps the number of modified files. A task does not require one exact source implementation; executable behavior is the primary oracle. The JSON configuration task is the exception: its requested output is a stable document, so it legitimately exercises the v1 snapshot checker.

这只是种子任务集，不是正式 benchmark。新增任务必须具备自包含 fixture、确定性 verifier、明确的 workspace 边界，以及能在 `result.json` 中识别的清晰失败信号。

This is a seed set, not a formal benchmark. Add a task only when it has a self-contained fixture, a deterministic verifier, an explicit workspace boundary, and a clear failure signal in `result.json`.
