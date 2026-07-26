# DWB v1 文件索引

- `00-overview.md`：Benchmark 总体定位、领域、难度和首批范围
- `01-golden-tasks.md`：36 个 Golden Tasks 的详细任务卡
- `02-task-and-verifier-spec.md`：Task、Fixture、Hidden Variant 和 Verifier 规范
- `03-implementation-roadmap.md`：与当前仓库对齐的 10 个 PR 实施计划
- `04-task-catalog.yaml`：机器可读任务目录
- `05-coding-agent-prompt.md`：可直接交给 Coding Agent 的总提示词

推荐交付方式：把整个目录放入仓库 `docs/eval/dwb-v1/`，然后让 Coding Agent 从 `05-coding-agent-prompt.md` 开始执行。
