# Code Style

本文件描述源码层面的通用写法；分层和文件放置见
[architecture.md](./architecture.md)，注释内容范围见
[comments.md](./comments.md)。

## Formatting

- TypeScript / TSX 使用 2 个空格缩进，保留项目现有 LF 换行和文件编码。
- 使用 Prettier 格式化，命令为 `pnpm format`；提交前用 `pnpm lint` 检查 ESLint。
- 局部修改优先，避免把无关的整文件格式化混入功能改动。
- renderer 内跨目录导入使用 `@/` alias；packages 之间使用 workspace 包名。

## Naming and Imports

- 变量、函数和文件使用 `camelCase`；类型、接口、类和 React 组件使用 `PascalCase`。
- 常量使用 `UPPER_SNAKE_CASE`，仅限真正跨函数共享且不会变化的值。
- 优先从具体文件导入，避免无明确边界的 `export *` barrel。
- 共享的 IPC / 业务类型放在 `packages/shared/src/types/`，不要在 preload 重复声明。

## Documentation Comments

- 源码注释统一使用英文，只记录代码无法自证的契约、原因、边界和非显然行为。
- 公共 API 或核心抽象有额外契约时使用多行 TSDoc，禁止单行 `/** ... */`；实现原因使用 `//`。
- 不强制文件头或导出符号注释，不重复函数名、参数名和 TypeScript 类型。
- 行为改变时同步更新或删除相邻注释；完整规则见 [代码注释](./comments.md)。

示例：

```ts
/**
 * Preserves an explicit profile so caller policy is never replaced by inference.
 */
export function resolveProfile(profile?: Profile): Profile {
  return profile ?? "general";
}
```
