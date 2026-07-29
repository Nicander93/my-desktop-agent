# 项目记忆 (MEMORY.md)

## 样式约定 (Styling convention)
- 采用"按稳定性分层"的两层方案：
  - **骨架层 (layout / 结构)**：用语义化 CSS class，集中在 `apps/renderer/src/styles/layout.css`。命名以 `app-` 为前缀（如 `.app-layout`、`.app-sidebar`、`.app-header`、`.app-main`、`.app-resize-handle`，子元素用 BEM 式 `__`，状态用 `--collapsed/--active`）。
  - **功能 / 叶子组件**（ui/* 原语、chat 面板等）：继续用 Tailwind utility，不在 layout.css 内。
- 颜色全部引用 `globals.css` `@theme` 中的设计令牌（`var(--color-*)`）；不要在骨架里散用裸 `text-gray-*`。已补充中性令牌：`--color-text-primary/secondary/tertiary/muted`、`--color-surface-hover`。
- 来自 store 的运行时值（如 `sidebarWidth`）继续用内联 `style`，不抽成 class。
- layout.css 为普通（未分层）CSS，在 Tailwind v4 中优先级高于 @layer utilities，确保骨架不被零散 utility 覆盖。
