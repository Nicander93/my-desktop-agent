# Desktop Agent

本地桌面 AI 工作台（Electron + React + Agent SDK）。

## 开发

```bash
pnpm install
pnpm setup:binaries   # Windows：首次安装 bundled node/git/uv
```

根目录配置 `.env`（至少 `CODEANY_API_KEY`），然后：

```bash
pnpm dev
```

完整步骤、排障、Review 清单见 **[开发者手册](docs/developer-guide.md)**。

## 质量检查

```bash
pnpm check    # typecheck + lint + dep-check + knip + test
pnpm lint
pnpm test
```

## 本地评测

```bash
pnpm eval -- --task benchmarks/tasks/coding-bugfix-basic/task.json --model <model> --base-url <url>
```

结果在 `eval-results/`。见 [开发者手册 §8](docs/developer-guide.md)、[benchmarks/README.md](benchmarks/README.md)。

## 文档

- [开发者手册](docs/developer-guide.md)
- [架构与分层](contributing/architecture.md)
- [IPC 契约](contributing/ipc-contract.md)
- [测试指南](contributing/testing.md)
- [评测](docs/eval/)
- [AI 贡献指引](AGENTS.md)
- [V0 产品范围](docs/v0.md)
