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

- 类、函数、接口和导出的类型使用多行 JSDoc，不使用单行 `/** ... */`。
- 注释说明“为什么”、约束、优先级、副作用或失败路径，不复述函数名和实现步骤。
- 文件头说明职责和边界；关键策略表、session map、魔法数说明生命周期或含义。
- 行为改变时同步更新或删除过时注释；新增或修改导出符号时补充注释。

示例：

```ts
/**
 * 保留显式 profile；未指定时使用通用策略。
 */
export function resolveProfile(profile?: Profile): Profile {
  return profile ?? 'general';
}
```
