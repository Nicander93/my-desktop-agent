# Coding evaluations

This package is a headless evaluation harness for Desktop Agent. It is deliberately useful before a benchmark exists: every task runs in a copied fixture workspace and leaves a reviewable run directory behind.

## Run an evaluation

The CLI automatically reads the project-root `.env`, using the same `CODEANY_*` convention as the desktop app. Shell environment variables take precedence, which is useful for CI and provider comparisons. You can also export values explicitly:

```powershell
$env:CODEANY_API_KEY = '...'
$env:CODEANY_MODEL = '...'
$env:CODEANY_BASE_URL = 'https://...'
pnpm eval:coding -- --suite smoke --model environment
```

Use `pnpm eval:coding -- --suite smoke --dry-run` to validate task selection without making a model call. Other presets are `ollama-local` and `openrouter-cheap`; their required environment variables are defined in [model-presets.ts](./model-presets.ts).

Before a paid or remote run, use `pnpm eval:coding -- --suite smoke --validate-config`. It validates that the selected preset has credentials without printing them or contacting a model.

Artifacts are written below `evals/coding/runs/<run-id>/<task-id>/` and are intentionally ignored by Git:

- `workspace/` and `baseline/`: the isolated, final workspace and its pristine source.
- `trace.jsonl` / `trace.json`: unmodified SDK trace spans when the agent starts.
- `events.jsonl`: the canonical review stream, combining raw SDK spans with harness-level file-change, error, timeout, and run-boundary events.
- `diff.patch`: baseline-to-workspace diff, including untracked changes.
- `result.json` and `report.md`: machine-readable result and human review report.

## Task contract

Tasks are JSON files in `tasks/<suite>/`. Every task has a fixture directory relative to its JSON file, a prompt, optional execution limits, and deterministic checks. The v1 checks are:

- `file-exists`
- `file-contains` (`match` is `all` by default)
- `command` (executable plus argument array; never a shell string)
- `snapshot` (compares a workspace file with an immutable expected fixture)

Checks carry optional weights. The report exposes both individual results and an outcome score, so a partial result cannot look like a binary success. Command checks use `spawn(..., { shell: false })`; task paths are constrained to their workspace or task directory, preventing accidental path escapes.

`maxChangedFiles` is an additional guard check. It is useful for read-only and small-scope tasks, but it does not attempt to judge an agent trajectory. Tool repetition, cost diagnosis, and cross-model comparisons remain later evaluation phases.

## Adding a task

1. Add an isolated fixture under `tasks/fixtures/`; do not point a task at this repository's working tree.
2. Add `tasks/<suite>/<id>.json` using `coding-smoke-001.json` as a reference.
3. Add expected snapshot files outside the mutable fixture when exact output matters.
4. Run `pnpm eval:coding -- --task <id> --dry-run`, then run it against a configured model.

The runner executes tasks serially so their artifacts are deterministic and never share a workspace.

The initial v0/v1 corpus is documented in [TASKSET.md](./TASKSET.md). It contains three smoke tasks and three regression tasks; every mutation task begins with a failing verifier so a no-op cannot earn a passing score.
