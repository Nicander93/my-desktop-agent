# 编程评测 / Coding Evaluations

本包是 Desktop Agent 的无界面评测运行器。即使尚未形成正式 benchmark，它也可以用于开发：每个任务都会在复制出的 fixture 工作区中运行，并保留可供审阅的运行目录。

This package is a headless evaluation harness for Desktop Agent. It is useful before a formal benchmark exists: every task runs in a copied fixture workspace and leaves a reviewable run directory behind.

## 运行评测 / Run an Evaluation

CLI 会自动读取项目根目录的 `.env`，并沿用桌面应用的 `CODEANY_*` 配置约定。Shell 环境变量优先，便于 CI 注入配置或比较不同 provider。也可以显式设置变量：

The CLI reads the project-root `.env` and follows the desktop application's `CODEANY_*` convention. Shell environment variables take precedence, which is useful for CI and provider comparisons. Values can also be exported explicitly:

```powershell
$env:CODEANY_API_KEY = '...'
$env:CODEANY_MODEL = '...'
$env:CODEANY_BASE_URL = 'https://...'
pnpm eval:coding -- --suite smoke --model environment
```

使用 `pnpm eval:coding -- --suite smoke --dry-run` 可以只校验任务选择，不调用模型。其他 preset 包括 `ollama-local` 和 `openrouter-cheap`，所需环境变量定义在 [model-presets.ts](./model-presets.ts) 中。

Use `pnpm eval:coding -- --suite smoke --dry-run` to validate task selection without calling a model. Other presets are `ollama-local` and `openrouter-cheap`; their environment variables are defined in [model-presets.ts](./model-presets.ts).

执行付费或远程评测前，先运行 `pnpm eval:coding -- --suite smoke --validate-config`。该命令只检查所选 preset 是否具备凭据，不会打印密钥或联系模型。

Before a paid or remote run, use `pnpm eval:coding -- --suite smoke --validate-config`. It checks that the selected preset has credentials without printing them or contacting a model.

产物写入 `evals/coding/runs/<run-id>/<task-id>/`，并由 Git 忽略：

Artifacts are written to `evals/coding/runs/<run-id>/<task-id>/` and are ignored by Git:

- `workspace/` 和 / and `baseline/`：隔离后的最终工作区及其原始副本。 / The isolated final workspace and its pristine source.
- `trace.jsonl` / `trace.json`：Agent 启动后产生的原始 SDK trace spans。 / Unmodified SDK trace spans produced by the agent.
- `events.jsonl`：统一审阅事件流，包含 SDK spans 以及 harness 记录的文件变更、错误、超时和运行边界事件。 / The canonical review stream combining SDK spans with harness-level file-change, error, timeout, and run-boundary events.
- `diff.patch`：从 baseline 到 workspace 的 diff，包括未跟踪文件。 / The baseline-to-workspace diff, including untracked files.
- `result.json` 和 / and `report.md`：机器可读结果和人工审阅报告。 / The machine-readable result and human review report.

## 任务契约 / Task Contract

任务是 `tasks/<suite>/` 下的 JSON 文件。每个任务包含相对其定义文件的 fixture 目录、prompt、可选执行限制和确定性 checks。v1 支持：

Tasks are JSON files under `tasks/<suite>/`. Each task contains a fixture directory relative to its definition, a prompt, optional execution limits, and deterministic checks. v1 supports:

- `file-exists`
- `file-contains`（`match` 默认为 `all` / `match` defaults to `all`）
- `command`（可执行文件和参数数组，不接受 shell 字符串 / executable plus an argument array, never a shell string）
- `snapshot`（将 workspace 文件与不可变 expected fixture 比较 / compares a workspace file with an immutable expected fixture）

Check 可以设置权重。报告同时展示单项结果和 outcome score，避免部分完成被误判为二元成功。命令检查使用 `spawn(..., { shell: false })`；任务路径被限制在 workspace 或任务目录中，防止意外越界。

Checks may have weights. Reports expose both individual results and an outcome score, so partial completion cannot appear as binary success. Command checks use `spawn(..., { shell: false })`; task paths are constrained to the workspace or task directory to prevent accidental escapes.

`maxChangedFiles` 是额外的保护性检查，适用于只读或小范围任务，但不评价 Agent trajectory。工具重复、成本诊断和跨模型比较属于后续阶段。

`maxChangedFiles` is an additional guard check for read-only or small-scope tasks, but it does not judge an agent trajectory. Tool repetition, cost diagnosis, and cross-model comparison belong to later phases.

## 添加任务 / Adding a Task

1. 在 `tasks/fixtures/` 下添加隔离 fixture，不要让任务直接指向本仓库工作区。 / Add an isolated fixture under `tasks/fixtures/`; never point a task at this repository's working tree.
2. 参考 `coding-smoke-001.json` 添加 `tasks/<suite>/<id>.json`。 / Add `tasks/<suite>/<id>.json`, using `coding-smoke-001.json` as a reference.
3. 需要精确输出时，将 expected snapshot 放在可变 fixture 之外。 / When exact output matters, place expected snapshots outside the mutable fixture.
4. 先运行 `pnpm eval:coding -- --task <id> --dry-run`，再使用已配置模型执行。 / Run `pnpm eval:coding -- --task <id> --dry-run` before executing against a configured model.

Runner 串行执行任务，使产物保持确定性，并确保任务之间不共享 workspace。

The runner executes tasks serially so artifacts remain deterministic and tasks never share a workspace.

初始 v0/v1 语料记录在 [TASKSET.md](./TASKSET.md) 中，包括 3 个 smoke 任务和 3 个 regression 任务。每个修改类任务的 verifier 初始状态都应失败，防止空操作获得通过结果。

The initial v0/v1 corpus is documented in [TASKSET.md](./TASKSET.md). It contains three smoke tasks and three regression tasks. Every mutation task starts with a failing verifier so a no-op cannot pass.
