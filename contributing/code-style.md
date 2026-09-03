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

## File Organization and Helpers

对于以单个公开 class、函数或组件为入口的文件，优先让读者先看到公开契约和主流程，再看到私有实现：

```text
imports
公开类型与错误
主要公开实现
配置与校验 helper
输入转换 helper
输出转换 helper
错误转换 helper
```

- 私有函数按调用链和数据流分组，不按字母排序。
- 只服务于当前模块的协议转换、兼容处理和类型守卫留在当前文件，不因为函数数量增加就放进通用 `utils/`。
- helper 形成独立职责、被多个模块复用，或需要独立测试时再拆文件；文件变长本身不是拆分理由。
- 原生平台能力或仓库已有依赖足够时，不为一两个简单 helper 新增工具库。新增依赖前先确认它提供了当前代码真正需要且不容易自行正确实现的语义。

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
