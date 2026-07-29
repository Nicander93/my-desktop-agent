/** Desktop Agent 专用 officecli skill：pptx/xlsx 均走 create + batch；禁止 open 交互流 */
export const OFFICECLI_PPTX_AGENT_SKILL = `---
name: officecli-pptx-agent
description: Desktop Agent 专用 officecli。先 create 再 batch；禁止 open/save/load_skill 交互流。
---

# OfficeCLI（Desktop Agent 版）

覆盖 \`.pptx\` 与 \`.xlsx\`。

## 优先级

1. 本指引 + Runtime Profile 硬约束优先。
2. 禁止官方 skill 的 **open → add → save**；Agent 用 **create + batch**。
3. 属性不确定：\`officecli help pptx <element>\` 或 \`officecli help excel <element>\`（不要 \`--json\`）。

## 标准流程（少工具调用）

1. 读输入；需要时 \`mkdir -p output\`。
2. **创建空文件（必须）**：\`officecli create "output/deck.pptx" --json\`  
   （xlsx：\`officecli create "output/report.xlsx" --json\`）  
   **batch 不会自动建文件**；缺 create 会 \`file_not_found\`。  
   已存在要重建：\`officecli close "..."\` 后 \`officecli create "..." --force --json\`（或直接对已有文件再 batch，不必删建）。
3. **Write** 纯 JSON batch（\`pptx-batch.json\` / \`xlsx-batch.json\`）。4. **一次** Bash：\`officecli batch "output/deck.pptx" --input "pptx-batch.json" --json\`
5. 可选一次验收：\`officecli validate ... --json\` 或 \`view outline\`
6. 任务同时要 Excel + PPT：各自 create → Write batch → batch（可先 xlsx 后 pptx）。

禁止：\`officecli open\` / \`save\` / \`watch\` / \`load_skill\`（阻塞或巨量上下文）。
允许：\`officecli create\`（建空文件）；完成后如文件被占用可 \`officecli close "..."\`。
禁止：\`officecli batch "batch.json" --json\`（缺目标 .pptx/.xlsx）。
禁止：python-pptx / openpyxl（除非任务明确要求且无 officecli）。

## batch JSON 形状

每条对象：\`command\` 为动词，参数与 CLI 同级：

\`\`\`json
[
  {"command":"add","parent":"/","type":"slide","props":{"layout":"blank","background":"065A82"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"标题","x":"2cm","y":"7cm","width":"29cm","height":"3cm","size":"44","bold":"true","color":"FFFFFF","align":"center"}}
]
\`\`\`

\`\`\`bash
officecli create "output/deck.pptx" --json
officecli batch "output/deck.pptx" --input "batch.json" --json
\`\`\`

## PPTX：最小 3 页

\`\`\`json
[
  {"command":"add","parent":"/","type":"slide","props":{"layout":"blank","background":"065A82"}},
  {"command":"add","parent":"/slide[1]","type":"shape","props":{"text":"封面标题","x":"2cm","y":"6cm","width":"29cm","height":"3cm","font":"Georgia","size":"44","bold":"true","color":"FFFFFF","align":"center"}},
  {"command":"add","parent":"/","type":"slide","props":{"layout":"blank","background":"FFFFFF"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"要点","x":"1.5cm","y":"1.2cm","width":"30cm","height":"1.5cm","font":"Georgia","size":"32","bold":"true","color":"21295C"}},
  {"command":"add","parent":"/slide[2]","type":"shape","props":{"text":"• 第一点\\n• 第二点\\n• 第三点","x":"1.5cm","y":"3.2cm","width":"30cm","height":"10cm","font":"Calibri","size":"20","color":"21295C"}},
  {"command":"add","parent":"/slide[2]","type":"notes","props":{"text":"讲者备注"}},
  {"command":"add","parent":"/","type":"slide","props":{"layout":"blank","background":"21295C"}},
  {"command":"add","parent":"/slide[3]","type":"shape","props":{"text":"谢谢","x":"2cm","y":"7cm","width":"29cm","height":"3cm","font":"Georgia","size":"40","bold":"true","color":"FFFFFF","align":"center"}}
]
\`\`\`

设计：一页一主题；标题 ≥ 36pt bold，正文 ≥ 18pt；深色底文字 \`FFFFFF\`；内容页加 notes。

## XLSX：区域汇总

路径：\`/<SheetName>/<A1>\`。先 add sheet，再 set cell。

\`\`\`json
[
  {"command":"add","parent":"/","type":"sheet","props":{"name":"Summary"}},
  {"command":"set","path":"/Summary/A1","props":{"value":"Region","bold":"true"}},
  {"command":"set","path":"/Summary/B1","props":{"value":"Amount","bold":"true"}},
  {"command":"set","path":"/Summary/A2","props":{"value":"North"}},
  {"command":"set","path":"/Summary/B2","props":{"value":"150","type":"number"}},
  {"command":"set","path":"/Summary/A3","props":{"value":"South"}},
  {"command":"set","path":"/Summary/B3","props":{"value":"80","type":"number"}},
  {"command":"set","path":"/Summary/A4","props":{"value":"Total","bold":"true"}},
  {"command":"set","path":"/Summary/B4","props":{"formula":"SUM(B2:B3)"}}
]
\`\`\`

\`\`\`bash
officecli create "output/report.xlsx" --json
officecli batch "output/report.xlsx" --input "xlsx-batch.json" --json
\`\`\`

### Excel 易错点

- 数字：\`"type":"number"\`；文本：\`"type":"string"\`。**避免** \`numberformat:"@"\`（易被 JSON/转义弄坏）。
- 用 \`set\` + \`path":"/Sheet/A1"\`；不要依赖未文档化的 \`ref\`。
- 公式不要前导 \`=\`（写 \`SUM(B2:B3)\`）。
- create 后的默认 Sheet1 可留着或 remove；业务数据放自建 sheet。

## 路径与 Shell

- 优先工作区相对路径（\`output/a.pptx\`、\`batch.json\`）。
- Bash 为 Git Bash：Write JSON 再 \`--input\`，避免 heredoc。
- 不要把 batch.json 当成 \`batch\` 的 \`<file>\` 参数。

## 失败处理

1. \`file_not_found\` → 先 \`officecli create\`，确认 \`mkdir -p output\`。
2. 只看前几条 error，最小修补 JSON 后重跑 batch。
3. JSON/\`@\`/转义问题：用 Write 重写文件。
4. 无错误不要整份重写；不要反复 help/load_skill。

## 验收（各一次）

\`\`\`bash
officecli view "output/deck.pptx" outline
officecli validate "output/deck.pptx" --json
officecli get "output/report.xlsx" /Summary --json
\`\`\`
`;
