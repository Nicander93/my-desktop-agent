# Benchmarks

任务定义和 fixture 放这里。跑的时候由 `packages/agent-eval` 拷到隔离目录，结果写到 `eval-results/`（已 ignore）。

不要靠改测试、保护文件或 expected 快照来刷通过率。

## 目录

```
benchmarks/tasks/<task-id>/
  task.json
  metadata.yaml   # DWB 可选：domain / difficulty
  fixture/
  harness/        # 判分脚本（可不进 Agent workspace，用 resolveArgsFromTaskDir）
  expected/       # 可选，snapshot 用
  reference/      # 参考实现（验 Verifier）
  faults/         # 故障实现（应被 Verifier 拒绝）

benchmarks/hidden-fixtures/<task-id>/<variant>/
```

`task.json` 里的 `suite`（如 `smoke`）给 `--suite` 用；DWB 用 `suite: quality` + `tags: ["dwb", ...]`。

## 现有任务（coding / office）

| id | suite | 做什么 |
|----|-------|--------|
| `coding-bugfix-basic` | — | 修筛选逻辑，跑 test/build |
| `coding-smoke-001`…`003` | smoke | 小编码题 |
| `coding-regression-001`…`003` | regression | 回归题 |
| `coding-mario-web` | — | 平台跳跃行为检查；判分在 `harness/` |
| `office-ai-ppt` | — | PPT，命令/OOXML 校验 |
| `office-excel-report` | — | Excel，同上 |

## Desktop Workload Benchmark（36）

设计文档：`docs/eval/dwb/`。全部 `tags` 含 `dwb`，可用：

```bash
# 模型读 .env（CODEANY_MODEL / CODEANY_BASE_URL）
pnpm eval:dwb
pnpm eval -- --task benchmarks/tasks/DP-001/task.json
pnpm eval -- --task-id DP-001 --repeat 5
# 多现场并行（N 个独立进程分摊任务）
pnpm eval -- --all --concurrency 4 --output eval-results/_full-run
pnpm eval:report -- --group-by domain,difficulty
```

| id | domain | 标题 |
|----|--------|------|
| PP-001 | personal-productivity | Downloads Organizer |
| PP-002 | personal-productivity | Photo Library Organizer |
| PP-003 | personal-productivity | Personal Archive Builder |
| KW-001 | knowledge-work | Multi-document Brief |
| KW-002 | knowledge-work | Meeting Minutes |
| KW-003 | knowledge-work | Research Digest |
| DP-001 | data-processing | Messy CSV Cleaner |
| DP-002 | data-processing | Multi-source Data Merge |
| DP-003 | data-processing | Reusable Format Converter |
| SD-001 | software-development | Real Repository Bug Fix |
| SD-002 | software-development | Incremental Feature |
| SD-003 | software-development | Dependency Upgrade |
| OA-001 | office-automation | Excel Analysis Dashboard |
| OA-002 | office-automation | Presentation from Brief |
| OA-003 | office-automation | Document Report Generator |
| FM-001 | file-management | Duplicate File Audit |
| FM-002 | file-management | Safe Batch Rename |
| FM-003 | file-management | Verified Backup |
| MP-001 | media-processing | Image Batch Optimization |
| MP-002 | media-processing | PDF Packet Builder |
| MP-003 | media-processing | Audio Transcript Package |
| IW-001 | internet-workflow | Offline Web Data Extraction |
| IW-002 | internet-workflow | RSS Digest from Fixtures |
| IW-003 | internet-workflow | Resumable Download Plan |
| CM-001 | communication | Inbox Triage from Mail Export |
| CM-002 | communication | Grounded Reply Drafts |
| CM-003 | communication | Meeting Scheduling Proposal |
| BW-001 | business-workflow | Expense Reconciliation |
| BW-002 | business-workflow | Sales Performance Pack |
| BW-003 | business-workflow | Contract Obligation Register |
| SA-001 | system-administration | Docker Compose Repair |
| SA-002 | system-administration | Service Log Diagnosis |
| SA-003 | system-administration | Disk Cleanup Plan |
| CW-001 | cross-application | Sales Reporting Pipeline |
| CW-002 | cross-application | Research to Presentation |
| CW-003 | cross-application | Project Handover Pack |

通过与否只看 Verifier。过程日志默认打到 **stderr**；只要结果加 `--quiet`。

入口说明：`docs/developer-guide.md`；DWB 设计：`docs/eval/dwb/`。
