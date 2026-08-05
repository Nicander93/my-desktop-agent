# Scripts

根目录脚本用于构建本地包、准备 Windows bundled runtime、启动开发环境和检查依赖边界。脚本不属于产品运行时 API；修改入口命令时同时更新根 `package.json` 与 [`docs/developer-guide.md`](../docs/developer-guide.md)。

| 脚本                            | 调用入口                               | 副作用与限制                                                                                          |
| ------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `ensure-built.mjs`              | `postinstall`、`build:packages`、`dev` | 构建 shared、SDK、Runtime；`--force` 强制重建。                                                       |
| `setup-binaries.ts`             | `pnpm setup:binaries`                  | 下载/准备 bundled Node、Git Bash、uv 等二进制；当前仅支持 Windows。`--check` 不写入，只检查就绪状态。 |
| `free-dev-port.ts`              | `pnpm dev`                             | 释放或等待 renderer 开发端口；只应在本地开发启动前运行。                                              |
| `wait-and-start-electron.ts`    | `pnpm dev`                             | 等待 renderer 可用后启动 Electron；会管理开发子进程。                                                 |
| `dep-check.mjs`                 | `pnpm dep-check`、`pnpm check`         | 运行 dependency-cruiser，只读检查分层 import。                                                        |
| `check-comment-coverage.mjs`    | 手动执行                               | 默认审计文件头 JSDoc；加 `--symbols` 输出缺少紧邻声明注释的符号清单。当前不接入质量门禁。             |
| `migrate-renderer-features.mjs` | 手动维护工具                           | 迁移 renderer Feature 目录；运行前审阅目标路径与 git diff，避免覆盖人工调整。                         |

## 常见场景

首次 Windows 开发：`pnpm install` 后运行 `pnpm setup:binaries`。日常启动用 `pnpm dev`；修改 packages 后可用 `pnpm build:packages`。提交前运行 `pnpm check`，它依次执行 typecheck、lint、依赖边界、knip 和测试。

如果 `setup-binaries --check` 失败，先重新执行 `pnpm setup:binaries`；不要手动把二进制目录加入版本控制。若开发端口仍被占用，停止遗留开发进程后再运行 `pnpm dev`。
