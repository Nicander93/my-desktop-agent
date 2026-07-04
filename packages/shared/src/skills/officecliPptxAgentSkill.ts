/** Desktop Agent 专用 officecli PPT skill（batch-only，不含 open 交互流程） */
export const OFFICECLI_PPTX_AGENT_SKILL = `---
name: officecli-pptx-agent
description: Desktop Agent 专用 officecli PPT 规则。batch 一次性落盘，禁止 open/close/save/load_skill。
---

# OfficeCLI PPTX（Desktop Agent 版）

## 优先级

1. 本指引 + Runtime Profile 的 **Agent 执行约束** 优先。
2. 若曾阅读 \`officecli load_skill pptx\` 或官方 skill 中的 **open → add → save**，在 Agent 中 **一律不要执行**。
3. 属性名不确定时：\`officecli help pptx <element>\`（不要 \`--json\` 拉完整 schema）。help 与本文冲突时以 help 为准。

## Agent 执行流程

1. 列出全部 slide 标题顺序（封面 → 章节 → 内容 → 结尾）。
2. 用 **Write** 把完整 batch 写入 \`batch.json\`（纯 JSON，不依赖 shell 变量展开）。
3. **一次**执行：\`officecli batch "目标.pptx" --input "batch.json" --json\`
4. 成功后 **一次**验收：\`officecli validate\` 或 \`view outline\` / \`stats\`，然后结束。

禁止：\`officecli open\`、\`close\`、\`save\`、\`watch\`、\`officecli load_skill\`（常驻或巨量上下文，Bash 会阻塞）。

\`batch\` 单独运行已内含 open/save；不要先 open 再 batch，也不要 create 后再 open。

## batch JSON 形状

每条命令是一个 **对象**，\`command\` 是动词，其余字段与 CLI 参数同级（不是把 CLI 拼成字符串）：

\`\`\`json
[
  {"command":"add","parent":"/","type":"slide","props":{"layout":"blank","background":"065A82"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"标题","x":"2cm","y":"7cm","width":"29cm","height":"3cm","font":"Georgia","size":"44","bold":"true","color":"FFFFFF","align":"center"}},
  {"command":"add","parent":"/slide[1]","type":"notes","props":{"text":"讲者备注"}}
]
\`\`\`

执行：\`officecli batch "deck.pptx" --input "batch.json" --json\`

常见动词：\`add\` / \`set\` / \`remove\` / \`move\`。90% 内容是 slide、shape、notes、chart、picture。

目标文件不存在时，batch 会在首次写入时创建；无需单独的 create + open。

## Windows / PowerShell 注意

- Agent 在 Windows 上 Bash 工具实际是 PowerShell。
- **推荐**：Write 写出 JSON 文件，再 \`officecli batch "x.pptx" --input "batch.json" --json\`，避免 heredoc 与 \`$\` 展开。
- 若必须用 shell 拼命令，路径用双引号；字面量 \`$\` 在 PowerShell 里要转义。
- JSON 文件内的 \`$\` **不需要** shell 转义。

## 设计底线（精简）

- 一 slide 一主题；标题 ≥ 36pt bold，正文 ≥ 18pt。
- 最多两种字体（如 Georgia 标题 + Calibri 正文）；配色 3–5 色，深色底上文字用 \`FFFFFF\`。
- 每页除文字外至少一个视觉元素（形状/图表/图）；每页 content slide 加 speaker notes。
- 自定义版式用 \`layout=blank\`；标题通常是普通 shape，不是 placeholder。

配色可参考：Ocean Gradient 主色 \`065A82\` / \`1C7293\` / \`21295C\`；Teal Trust \`028090\` / \`00A896\` / \`02C39A\`。

## 失败处理

- 只看 batch 返回的 **前 5 条**错误，做最小 JSON 修补后重跑 batch。
- 无错误时不要重写整份 batch。
- 不要重复 load_skill、help、validate。

## 验收（一次）

\`\`\`bash
officecli view "deck.pptx" outline
officecli validate "deck.pptx" --json
\`\`\`
`;
