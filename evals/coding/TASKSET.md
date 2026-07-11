# v0/v1 coding task set

The first task set intentionally uses small, self-contained JavaScript fixtures. It evaluates the Desktop Agent runtime and its file/shell/tool loop without importing benchmark-specific infrastructure or mutating this repository.

| Suite | Task | Primary capability | Baseline state |
| --- | --- | --- | --- |
| smoke | `coding-smoke-001` | Create a module and validate it | Missing implementation |
| smoke | `coding-smoke-002` | Read a failure and repair a local calculation | Failing assertion |
| smoke | `coding-smoke-003` | Write exact structured data | Missing file |
| regression | `coding-regression-001` | Handle validation edge cases | Permissive parser |
| regression | `coding-regression-002` | Transform collections without mutation | Missing implementation |
| regression | `coding-regression-003` | Preserve immutability in nested update | In-place mutation |

Each mutation task starts with a failing `node verify.mjs` command and caps modified files. A task does not require one exact source-code implementation: executable behavior is the primary oracle. The JSON configuration task is the exception because its requested output is itself a stable document, so it exercises the v1 snapshot checker legitimately.

This is deliberately a seed set, not a benchmark. Add a task only when it has a self-contained fixture, a deterministic verifier, an explicit workspace scope, and a clear failure signal in `result.json`.
