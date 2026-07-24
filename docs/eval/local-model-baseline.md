# 本地模型基线（2026-07-24）

本次基线使用现有 Ollama 服务 `http://127.0.0.1:11434/v1`，未下载、替换或微调模型。评测通过与否只以 `agent-eval` 的 Verifier 结果为准，不采信 Agent 的完成声明。

## 已验证的运行链路

`qwen3.5:9b` 在 `coding-bugfix-basic@1.0.0` 上至少有一次完整通过：

- `src/filter.js` 被最小化修复；
- 受保护的 `test/filter.test.js` 和 `package.json` 保持不变；
- `pnpm --ignore-workspace test` 与 `build` 均由 Verifier 判定为通过；
- 运行工件（Trace、diff、result）保存在已忽略的 `eval-results/` 中。

## 重复运行结果

在评测环境修复完成后的三次 `qwen3.5:9b` 运行中：1 次通过、1 次 Verifier 失败、1 次因达到 Agent 最大回合数报错。该波动被保留为真实基线，未通过调整基准测试、保护文件或参考结果提高分数。

本机也安装了 `qwen2.5-coder:7b`；其本次单次同任务运行未通过 Verifier，因此不作为成功基线宣称。

## 范围与后续

本机当前没有可用的 14B 本地模型或已配置的云端模型凭据。按“使用已有模型、不重新下载”的要求，本 PR 只提交可复现的本地评测能力与已有模型的真实结果；14B 与云端对照应在提供模型/凭据后，使用同一任务与 Verifier 追加运行，而不修改基准。
