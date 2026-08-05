# My Desktop Agent 全仓代码注释与文档规范化执行方案

> 适用仓库：`Nicander93/my-desktop-agent`  
> 执行对象：Coding Agent  
> 目标：让仓库中的所有自有源码文件、核心代码单元和关键设计约束都有可维护的中文注释，并建立结构清晰、入口统一、能够长期更新的项目文档体系。

---

## 1. 背景

当前仓库已经具备 README、开发者手册、架构说明、IPC 契约、测试说明和部分注释规范，但源码中的注释覆盖不均匀：

- 一些核心文件已经有文件头和局部说明。
- 部分函数、类、方法、构造函数、React 组件、Hook、接口和类型缺少统一的 JSDoc。
- 一些复杂逻辑只有简短说明，没有写清设计原因、生命周期、失败路径和约束。
- 文档虽然存在，但入口分散，包级文档不完整。
- 现有 ESLint 没有强制检查函数、类和公共类型的文档注释，规范容易在后续修改中失效。

本任务不是简单增加注释数量，而是让开发者或后续 Agent 能快速回答：

1. 这个文件和代码单元负责什么？
2. 为什么采用当前实现？
3. 有哪些不能破坏的约束？
4. 输入、输出、副作用和失败路径是什么？
5. 修改这里还需要同步修改哪些文件？
6. 相关的架构或详细文档在哪里？

---

## 2. 总体目标

### 2.1 注释覆盖目标

完成后应达到以下覆盖标准：

- `apps/`、`packages/`、`scripts/` 下所有自有源码文件都有文件级说明。
- 所有函数、类、构造函数、类方法、getter/setter、React 组件和 React Hook 都有多行 JSDoc，不区分是否导出、是否 public/private。
- 所有接口、类型、枚举和有领域含义的常量都有多行 JSDoc。
- 赋值给变量的命名箭头函数同样必须有 JSDoc。
- 包含业务逻辑的匿名回调应提取为命名函数并补充 JSDoc；仅做简单映射、过滤或事件转发的一行匿名回调，可由所属函数的 JSDoc 覆盖。
- 所有复杂状态、缓存、Map、策略表、注册表和生命周期变量都有说明。
- 所有非显然的分支、降级逻辑、兼容逻辑、权限逻辑和错误恢复逻辑都有说明。
- 所有魔法数、空字符串、特殊默认值和顺序依赖都有原因说明。
- 所有 IPC、Runtime、Agent、Profile、Capability、Policy、Verifier 等核心链路都有边界说明。
- 所有测试文件都有测试范围说明，复杂测试用例说明验证意图。
- 所有脚本都有用途、输入、输出、副作用和运行条件说明。
- 配置文件在格式允许的情况下补充必要说明；JSON 等不支持注释的格式通过邻近 README 或文档说明。

### 2.2 文档目标

完成后应形成以下文档层次：

```text
README.md
docs/
  developer-guide.md
  architecture-overview.md
  adr/
    README.md
    0001-*.md
contributing/
  architecture.md
  code-style.md
  comments.md
  documentation.md
  ipc-contract.md
  testing.md
apps/
  electron/README.md
  renderer/README.md
packages/
  shared/README.md
  open-agent-sdk/README.md
  agent-runtime/README.md
  agent-eval/README.md
scripts/README.md
benchmarks/README.md
AGENTS.md
```

不要求无条件创建所有文件。先检查现有文档，已有内容应整理、补充和链接，避免重复维护同一份信息。

---

## 3. 核心原则

### 3.1 “所有代码都应有注释”的操作定义

“所有代码都应有注释”不等于每一行代码旁都写自然语言，而是：

- 每个源码文件有文件级说明。
- 每个有业务含义的代码单元有职责说明。
- 每段不容易从命名直接理解的逻辑有原因和约束说明。
- 简单赋值、明显的条件判断和直观 JSX 不做逐行翻译。
- 注释覆盖代码的设计信息，而不是重复语法。

错误示例：

```ts
// 获取工作区
const workspace = getWorkspace(id);

// 如果工作区不存在
if (!workspace) {
  // 返回 undefined
  return undefined;
}
```

正确示例：

```ts
// 对话可能指向已删除的工作区。此处返回 undefined，由 IPC 层转换成用户可理解的错误。
const workspace = getWorkspace(id);
if (!workspace) return undefined;
```

### 3.2 优先解释“为什么”

注释优先描述：

- 设计取舍
- 层级边界
- 生命周期
- 优先级
- 数据所有权
- 副作用
- 并发和顺序要求
- 失败路径
- 安全和权限约束
- 兼容原因
- 与其他文件的同步关系

不要只复述函数名或代码步骤。

### 3.3 注释必须与代码同步

行为发生变化时：

- 同步更新注释。
- 删除已经失效的注释。
- 不保留“以后再改”但没有追踪入口的注释。
- `TODO`、`FIXME`、`HACK` 必须说明原因，并关联 Issue 或明确退出条件。

### 3.4 注释不能替代重构

遇到以下情况，不应只写大段注释：

- 一个函数承担多个层次的职责。
- 一个文件同时处理 IPC、数据库、策略、转换和 UI 状态。
- 参数和返回值难以表达真实语义。
- 分支过深，需要靠长注释才能理解。
- 多处复制同一种规则。

应先做小范围、低风险重构，再补注释。不得借本任务进行大规模架构重写。

---

## 4. 注释语言与格式

### 4.1 语言

- 仓库自有代码的说明性注释统一使用中文。
- 代码标识符、标准协议名、库名、API 名称保留英文。
- 对外发布的 SDK API 如已有英文文档，可保留英文，但同一文件内保持一致。
- 不要中英文重复写同一段内容。

### 4.2 TypeScript / JavaScript JSDoc

所有函数、类、构造函数、类方法、getter/setter、React 组件、React Hook，以及接口、类型、枚举和有领域含义的常量，统一使用多行 JSDoc。该要求不区分是否导出，也不区分 `public`、`protected` 或 `private`：

```ts
/**
 * 根据请求中的 Profile、Capability、模型能力和覆盖项生成最终执行策略。
 *
 * 合并顺序必须保持稳定，后层只允许在明确规则下覆盖前层。
 */
export function resolveExecutionPolicy(
  request: RuntimeExecutionRequest = {},
): ResolvedExecutionPolicy {
  // ...
}
```

复杂公共 API 根据需要补充：

```ts
/**
 * 为指定会话创建或复用 Agent。
 *
 * 当模型配置发生变化时必须关闭旧 Agent，避免旧 Provider 和凭证继续生效。
 *
 * @param sessionId 会话标识，与 conversationId 保持一致。
 * @param sessionOptions 会话级工作区、模型、MCP 和 Skill 配置。
 * @returns 可用于执行查询的 Agent 实例。
 * @throws 当 SDK 初始化或 Provider 配置无效时抛出错误。
 */
```

以下情况才使用标签：

- `@param`：参数语义无法从类型和命名充分表达。
- `@returns`：返回值存在特殊状态或约束。
- `@throws`：函数确实可能向调用方抛出异常。
- `@remarks`：需要记录较长的设计约束。
- `@example`：公共 API 容易被误用。
- `@deprecated`：已有替代方案并计划移除。

不要机械地为每个参数重复类型信息。

### 4.2.1 函数与类的强制覆盖范围

以下代码单元一律必须有多行 JSDoc：

- `function foo()` 形式的函数声明。
- `const foo = () => {}`、`const foo = function () {}` 形式的命名函数变量。
- 类声明和抽象类。
- `constructor`。
- `public`、`protected`、`private`、`static` 和抽象方法。
- getter 和 setter。
- React 函数组件。
- 自定义 React Hook。
- 工厂函数、注册函数、解析函数、转换函数和测试辅助函数。
- 测试文件中抽取出的 helper、factory 和 setup 函数。

匿名回调按以下规则处理：

```ts
// 简单的一行映射允许保留匿名形式，由所属函数的 JSDoc 覆盖。
const ids = items.map((item) => item.id);
```

```ts
/**
 * 将原始消息转换为 UI 可消费的消息，并过滤无显示意义的事件。
 */
function toUiMessage(message: SDKMessage): UiMessage | undefined {
  // ...
}

const messages = sdkMessages
  .map(toUiMessage)
  .filter(isDefined);
```

匿名回调出现以下任一情况时，必须提取为命名函数并添加 JSDoc：

- 超过一条表达式或一个简单返回语句。
- 包含条件分支、循环、异常处理或异步操作。
- 修改外部状态。
- 具有业务语义。
- 在多个位置重复。
- 需要单独测试。
- 仅靠上下文无法立即理解其目的。

构造函数即使只做依赖赋值，也必须说明类的初始化约束。简单 getter/setter 可以只写一句话，但不能完全缺失注释。

### 4.3 文件头

所有自有源码文件都应在顶部说明职责和边界。

推荐模板：

```ts
/**
 * 负责 Agent 相关 IPC 的注册和主进程编排。
 *
 * 本文件只组装工作区、模型、MCP、Skill 和流式事件，不实现 Agent 核心循环。
 * 修改 IPC channel 时必须同步更新 preload 和 renderer 端类型声明。
 */
```

文件头应覆盖：

- 文件负责什么。
- 不负责什么。
- 与哪些层或文件协作。
- 修改时最容易破坏的约束。

简单文件可缩短为一到两句，但不能使用毫无信息量的模板。

### 4.4 内联注释

内联注释用于说明局部非显然行为：

```ts
// 显式空字符串用于阻止 SDK 回退读取全局 CODEANY_API_KEY，避免请求发送到错误端点。
apiKey: sessionOptions?.modelConfig
  ? (sessionOptions.modelConfig.apiKey ?? '')
  : this.options.apiKey,
```

不要使用大段分隔线：

```ts
// ==============================
// Session Management
// ==============================
```

优先通过拆分函数、类型和文件表达结构。

### 4.5 React / TSX

需要注释：

- 自定义 Hook 的订阅、清理和依赖约束。
- 流式消息合并逻辑。
- Zustand 状态的所有权和持久化策略。
- 复杂 memo、effect、事件代理和异步竞争处理。
- 业务组件的职责与关键交互。

不需要注释：

- 每个 JSX 节点。
- 直观的按钮、标题和布局。
- 仅包装样式的简单组件。

### 4.6 测试文件

每个测试文件顶部说明：

- 被测试模块。
- 主要行为或风险。
- 哪些内容不在本文件范围内。

复杂用例说明“为什么需要验证”，不要复述断言：

```ts
it('模型配置变化时重建 Agent', async () => {
  // 该用例防止会话继续复用旧 Provider，导致请求使用错误凭证。
});
```

### 4.7 脚本

`scripts/` 下每个脚本需要说明：

- 运行场景。
- 输入参数或环境变量。
- 会修改哪些文件或进程。
- 是否可重复执行。
- Windows、Linux 或 CI 限制。
- 失败后的恢复方式。

### 4.8 配置文件

- `.js`、`.ts`、`.mjs`、`.cjs` 配置文件直接补注释。
- YAML 可对非显然步骤补充简短说明。
- JSON、`package.json`、`tsconfig.json` 等不支持标准注释，不得加入破坏解析的伪注释。
- 对 JSON 配置的解释应放在相邻 README、开发者手册或专门文档中。
- 锁文件、生成文件和第三方代码不补注释。

---

## 5. 不同代码单元的最低要求

| 代码单元 | 最低要求 |
|---|---|
| 源码文件 | 文件职责、边界、关键同步关系 |
| 函数（含内部函数） | 用途、重要约束、主要副作用；无论是否导出都必须有 JSDoc |
| 类 | 职责、生命周期、状态所有权、资源释放方式 |
| 构造函数 | 初始化约束、依赖来源、不得执行的重副作用 |
| 类方法 | 方法职责、状态变更、副作用、失败路径；包含 private/protected/static |
| getter/setter | 读取或更新语义、校验和副作用 |
| 命名箭头函数 | 与普通函数相同，必须有 JSDoc |
| React 组件 | 组件职责、状态来源、关键交互和边界 |
| React Hook | 状态来源、订阅、清理、并发约束 |
| 接口/类型 | 代表的领域概念及字段间约束 |
| 领域常量 | 使用范围、为什么不能动态变化 |
| Service | 数据所有权、事务或持久化行为 |
| IPC Handler | Channel 语义、输入、输出、错误转换 |
| Runtime/Engine | 会话、模型、工具、Trace 生命周期 |
| Policy Resolver | 合并顺序、覆盖规则、不变量 |
| Provider | 协议差异、重试、流式、错误映射 |
| Tool | 权限、副作用、输入验证、结果格式 |
| Verifier | 判定依据、容错范围、失败原因 |
| Migration | 版本、变更目的、向后兼容约束 |
| 测试 | 验证范围和关键风险 |
| 脚本 | 用途、参数、副作用、平台限制 |

---

## 6. 重点术语必须统一

补充注释和文档时，必须保持以下概念边界，不得混用。

### Model Config

用户或环境提供的模型连接配置，例如：

- model
- apiKey
- baseURL
- apiType

### Model Capability

模型自身能力，例如：

- 是否支持 tool calls
- context window
- 推荐最大轮次
- 多模态能力
- 推理能力

### Runtime Profile

面向任务场景的默认策略入口，例如：

- general
- coding
- office
- office-pptx
- file-organizing
- mcp

### Runtime Capability

Agent 执行任务所需的能力片段，例如：

- filesystem read/write
- shell
- office
- network
- MCP

### Execution Policy

由 Profile、Capability、模型能力、工作区策略和覆盖项共同解析出的最终执行策略。

### Workflow

Agent 为完成具体任务选择的步骤和工具调用路径。

### Verifier

评测中用于判断最终结果是否满足任务要求的验证器。

注释中发现概念混用时，应顺便修正命名或描述，但不要在本任务中重构整个体系。

---

## 7. 执行范围

### 7.1 必须处理

```text
apps/electron/src/**
apps/renderer/src/**
packages/shared/src/**
packages/open-agent-sdk/src/**
packages/agent-runtime/src/**
packages/agent-eval/src/**
scripts/**
*.config.js
*.config.ts
*.config.mjs
*.config.cjs
```

根据实际仓库结构调整，不存在的目录不要创建。

### 7.2 条件处理

```text
benchmarks/**
examples/**
.github/workflows/**
```

处理方式：

- Benchmark 的执行脚本、Verifier、任务 Schema 需要说明。
- Fixture 和样例数据不要求逐项注释。
- Examples 需要文件用途和关键步骤说明。
- Workflow 仅对非显然步骤补充 YAML 注释。

### 7.3 排除

```text
node_modules/**
dist/**
build/**
coverage/**
eval-results/**
*.lock
pnpm-lock.yaml
生成代码
第三方复制代码
二进制文件
图片和静态资源
Benchmark fixture 原始数据
```

如第三方代码被直接修改，应在文件头注明来源、许可证和本地改动，不进行全面重写。

---

## 8. 优先处理的核心文件

先处理高风险和高认知成本文件，再扩展到全仓。

### P0：Agent 核心链路

1. `packages/agent-runtime/src/runtime.ts`
2. `packages/agent-runtime/src/policies/resolver.ts`
3. `packages/agent-runtime/src/profiles.ts`
4. `packages/agent-runtime/src/capabilities/**`
5. `packages/open-agent-sdk/src/engine.ts`
6. `packages/open-agent-sdk/src/providers/**`
7. `packages/open-agent-sdk/src/tools/**`
8. `apps/electron/src/ipc/agentHandlers.ts`
9. `apps/electron/src/runtime/policy.ts`
10. `apps/renderer/src/hooks/useAgent.ts` 或实际 Agent Hook
11. `packages/agent-eval/src/runner.ts`
12. `packages/shared/src/types/**`

### P1：Electron 主进程

- `main.ts`
- `preload.ts`
- `ipc/*Handlers.ts`
- `services/**`
- `db/**`
- `runtime/**`
- 窗口和文件系统相关模块

### P2：Renderer

- Chat feature
- Workspace feature
- Settings feature
- Zustand stores
- 跨 feature hooks
- Trace 展示和流式消息转换
- 复杂业务组件

### P3：评测、脚本和配置

- Agent Eval CLI
- Verifier
- Benchmark loader
- Report generator
- Build/setup/dev scripts
- ESLint、Vitest、Vite、dependency-cruiser 配置

---

## 9. 分阶段执行步骤

### 阶段 0：建立基线

在修改代码前执行：

```bash
pnpm install
pnpm check
```

记录：

- 当前 `pnpm check` 是否通过。
- 当前失败项及其是否与本任务有关。
- 源码文件总数。
- 缺少文件头的文件数。
- 缺少 JSDoc 的函数、类、方法、构造函数、组件、Hook 和领域类型数量。
- 现有 README 和 contributing 文档清单。

不得把已有失败误判为本任务引入的问题。

建议新增临时审计脚本或使用 AST 工具统计，但不要把不成熟的扫描结果直接作为强制门禁。

### 阶段 1：修订注释和文档规范

优先更新：

- `contributing/comments.md`
- `contributing/code-style.md`
- 新增或补充 `contributing/documentation.md`
- `AGENTS.md`

需要明确：

- 文件头要求。
- 所有函数、类、方法和构造函数的 JSDoc 要求。
- 命名箭头函数、React 组件和 Hook 的 JSDoc 要求。
- 匿名回调的提取与豁免规则。
- React、测试、脚本和配置文件规则。
- 排除项。
- 注释与重构的边界。
- 注释语言。
- TODO/FIXME/HACK 规则。
- 新增文件和修改公共 API 时的 Review 检查项。

规范修改完成后，再进行大批量源码处理，避免不同批次使用不同标准。

### 阶段 2：处理 P0 核心链路

逐文件执行以下步骤：

1. 阅读整个文件和直接调用方。
2. 确认文件职责和层级。
3. 增加或修正文件头。
4. 为所有函数、类、构造函数、类方法、getter/setter、React 组件和 Hook 补多行 JSDoc，不区分导出级别。
5. 为接口、类型、枚举、领域常量以及复杂局部逻辑补充说明。
6. 为关键变量、策略表和特殊默认值补注释。
7. 删除复述代码、失效或误导性注释。
8. 发现职责严重混杂时，仅进行小范围提取函数。
9. 运行相关测试和类型检查。
10. 在提交说明中记录该文件新增了哪些设计信息。

每处理一组文件后运行：

```bash
pnpm typecheck
pnpm lint
pnpm test
```

### 阶段 3：处理全仓源码

按包或应用分批执行，建议顺序：

1. `packages/shared`
2. `packages/open-agent-sdk`
3. `packages/agent-runtime`
4. `apps/electron`
5. `apps/renderer`
6. `packages/agent-eval`
7. `scripts`
8. 配置文件和 Examples

每个批次独立完成：

- 注释
- 格式化
- 类型检查
- Lint
- 测试
- 文档更新

不要一次性修改全仓后才运行检查。

### 阶段 4：补齐包级文档

#### `packages/agent-runtime/README.md`

至少包括：

- 包职责
- 与 open-agent-sdk、Electron 的边界
- Session 生命周期
- Model Config 和 Model Capability
- Profile 和 Capability
- Policy Resolver 合并顺序
- 路径权限
- Skill/MCP 同步
- Trace
- 常见修改入口

#### `apps/electron/README.md`

至少包括：

- 主进程职责
- main 初始化顺序
- IPC 注册方式
- Service 分层
- preload 同步要求
- SQLite 和 Migration
- bundled runtime
- 窗口生命周期
- 错误处理约定

#### `apps/renderer/README.md`

至少包括：

- Feature 组织方式
- UI 原语和业务组件边界
- Zustand Store
- Agent 流式消息
- IPC 类型来源
- Hook 生命周期
- 页面和 Feature 的依赖规则

#### `packages/shared/README.md`

至少包括：

- Contract 层边界
- 类型放置规则
- 不能依赖哪些包
- Trace、Skill、IPC 类型的归属

#### `packages/agent-eval/README.md`

至少包括：

- Runner 流程
- Task Schema
- Workspace 隔离
- Profile/Capability 声明
- Verifier
- Retry 和多轮执行
- Result/Trace
- 报告生成

#### `scripts/README.md`

至少包括：

- 每个脚本用途
- 调用入口
- 平台要求
- 是否会修改文件或终止进程
- 常见失败和恢复方式

### 阶段 5：架构决策记录

仅为影响长期维护的重要决策建立 ADR，不要为普通实现细节写 ADR。

建议至少评估以下主题：

1. 为什么采用 Electron + React + 进程内 Agent SDK。
2. 为什么使用 `conversationId === sessionId`。
3. 为什么采用 Profile + Capability + Policy Resolver。
4. 为什么 Contract 类型集中在 `packages/shared`。
5. 为什么评测不启动 Electron。
6. 为什么 preload 和 renderer 类型需要成对维护。
7. 为什么模型配置变化时需要重建 Agent。

ADR 模板：

```md
# ADR-XXXX：决策标题

## 状态

Accepted / Superseded / Deprecated

## 背景

描述需要解决的问题。

## 决策

说明最终选择。

## 原因

说明关键取舍。

## 后果

说明收益、成本和后续约束。

## 替代方案

说明考虑过但未采用的方案。
```

### 阶段 6：增加自动检查

#### 6.1 JSDoc 检查

评估接入 TypeScript ESLint 的文档规则或独立 AST 检查脚本。

最低检查目标：

- 所有函数声明、类声明、构造函数、类方法、getter/setter 和命名箭头函数必须存在多行 JSDoc。
- 所有 React 组件和 React Hook 必须存在多行 JSDoc，无论是否导出。
- 所有接口、类型、枚举和有领域含义的常量必须存在多行 JSDoc。
- 新增源码文件必须存在文件头。
- 包含多步业务逻辑的匿名回调必须提取为命名函数并补充 JSDoc；简单一行回调允许豁免。
- 测试和简单 UI 原语可以降低严格度。

自动规则必须允许合理豁免，并避免因为装饰性注释导致大量无价值内容。

#### 6.2 文档链接检查

增加 Markdown 链接校验，至少检查：

- README 到开发者手册。
- AGENTS.md 到 contributing 文档。
- 包级 README 的相对链接。
- 不存在的文档路径。
- 重命名后遗留的旧链接。

#### 6.3 CI 集成

新增脚本示例：

```json
{
  "scripts": {
    "docs:check": "node scripts/check-docs.mjs",
    "comments:check": "node scripts/check-comments.mjs",
    "check": "pnpm typecheck && pnpm lint && pnpm dep-check && pnpm knip && pnpm docs:check && pnpm comments:check && pnpm test"
  }
}
```

先以报告模式运行，确认误报可接受后再升级为阻断模式。

---

## 10. 核心文件注释示例

### 10.1 Runtime 文件头

```ts
/**
 * 管理 Desktop Agent 的会话级运行时状态。
 *
 * 每个 sessionId 最多缓存一个 Agent；模型配置变化时必须销毁并重建，
 * 防止旧 Provider、API Key、Base URL 或上下文继续生效。
 *
 * 本模块不处理 Electron IPC、数据库持久化和 UI 消息转换。
 */
```

### 10.1.1 类与构造函数

```ts
/**
 * 管理单个工作区内的会话、模型和工具执行状态。
 *
 * 实例持有需要显式释放的 Agent 与 MCP 连接，调用方结束工作区时必须调用 close。
 */
export class WorkspaceRuntime {
  /**
   * 创建工作区运行时。
   *
   * 构造阶段只保存依赖，不执行模型请求、文件扫描或其他重型初始化。
   */
  constructor(
    private readonly workspaceId: string,
    private readonly agentFactory: AgentFactory,
  ) {}
}
```

### 10.1.2 私有方法

```ts
/**
 * 判断缓存 Agent 是否仍与当前模型配置匹配。
 *
 * 该检查只比较稳定配置标识，不比较可能动态变化的 API Key 明文。
 */
private isAgentReusable(
  sessionId: string,
  modelConfigId?: string,
): boolean {
  // ...
}
```

### 10.1.3 React 组件

```tsx
/**
 * 展示当前会话的消息流，并负责触发历史消息加载。
 *
 * 流式事件的订阅和清理由 useAgentMessages 管理，本组件不直接调用 Electron IPC。
 */
export function ChatMessageList(props: ChatMessageListProps) {
  // ...
}
```

### 10.2 Policy Resolver

```ts
/**
 * 将场景默认值、能力片段、模型限制和调用方覆盖项解析为最终执行策略。
 *
 * 合并顺序为：
 * Profile → Capability → Model Capability → Task Override → User Override。
 *
 * 资源上限采用“只收紧不放宽”原则，避免后层覆盖绕过模型或工作区限制。
 */
```

### 10.3 Session Map

```ts
/**
 * sessionId 到 Agent 实例的缓存。
 *
 * Agent 持有 Provider、消息历史、MCP 连接和 Trace 状态，删除缓存前必须调用 close。
 */
private readonly agents = new Map<string, Agent>();
```

### 10.4 IPC Handler

```ts
/**
 * 注册 Agent 领域的 IPC channel。
 *
 * Handler 负责把 Electron/数据库配置转换为 Runtime 参数，并将 SDK 流式事件
 * 转发给 renderer；不得在此实现 Provider 或工具执行逻辑。
 *
 * 修改 channel 或返回结构时必须同步更新 preload 和 renderer 类型声明。
 */
```

### 10.5 React Hook

```ts
/**
 * 订阅指定会话的 Agent 流式消息，并维护 UI 可消费的消息状态。
 *
 * 切换 conversationId 时必须移除旧订阅，避免同一事件被重复处理。
 */
```

### 10.6 Migration

```ts
/**
 * Migration 7：为 conversation 增加 model_config_id。
 *
 * 旧会话允许为空，并在读取时回退到默认模型配置。已发布 migration 不得修改，
 * 后续 schema 调整必须新增版本。
 */
```

---

## 11. 文档内容规范

### 11.1 README 是入口，不是所有细节的容器

根 README 只保留：

- 项目定位
- 快速开始
- 常用命令
- 文档导航
- 基本质量检查
- 评测入口

详细架构、开发规则和排障放到专门文档。

### 11.2 避免重复

同一个事实只保留一个权威来源：

- 架构边界：`contributing/architecture.md`
- 注释规则：`contributing/comments.md`
- 代码风格：`contributing/code-style.md`
- IPC：`contributing/ipc-contract.md`
- 测试：`contributing/testing.md`
- 开发入口：`docs/developer-guide.md`
- 包内部设计：对应包 README
- 重大决策：`docs/adr/`

其他文档只链接，不复制整段内容。

### 11.3 文档必须可验证

不要写模糊内容：

```md
系统支持丰富的工具和强大的扩展能力。
```

改为：

```md
Runtime 通过 `allowedTools` 和 `disallowedTools` 控制内置工具，
并通过 MCP Server 配置加载外部工具。
```

### 11.4 文档与代码引用

文档引用源码时使用稳定路径，不依赖具体行号：

```md
策略解析入口位于 `packages/agent-runtime/src/policies/resolver.ts`。
```

---

## 12. Agent 执行约束

执行本任务时必须遵守：

1. 不改变业务行为，除非是为降低注释复杂度所需的小范围重构。
2. 不进行大规模重命名、目录迁移或架构重写。
3. 不修改生成物、锁文件和第三方代码。
4. 不为满足数量要求添加无意义注释。
5. 不机械生成“该函数用于……”模板。
6. 不在每个 JSX 节点旁添加注释。
7. 不在 JSON 中添加非法注释。
8. 不删除已有有效文档。
9. 不复制粘贴同一段说明到多个文件。
10. 不写无法从当前代码确认的设计意图。
11. 无法确定原因时，先根据调用链和测试推断；仍不确定则使用明确的 `TODO(issue)`，不得编造。
12. 每批修改后运行质量检查。
13. 发现注释与实现冲突时，以实现和测试为依据，并在报告中指出。
14. 所有注释都必须经过人工可读性检查，不能只依赖脚本统计。
15. 提交应按模块拆分，避免一个超大提交修改全仓。

---

## 13. 推荐提交拆分

建议使用以下提交粒度：

```text
docs: refine repository comment and documentation standards
docs(runtime): document runtime architecture and public APIs
docs(electron): document IPC, services and process lifecycle
docs(renderer): document hooks, stores and streaming state
docs(eval): document runner, verifier and benchmark contracts
docs(scripts): document development and build scripts
chore: add comment and markdown validation
```

若伴随小范围代码重构，应使用独立提交：

```text
refactor(runtime): extract session option construction before documentation
```

不要把行为修改伪装成文档提交。

---

## 14. 验收标准

### 14.1 注释覆盖

- [ ] `apps/`、`packages/`、`scripts/` 下所有自有源码文件都有文件头。
- [ ] 所有函数、类、构造函数、类方法、getter/setter 和命名箭头函数都有多行 JSDoc。
- [ ] 所有 React 组件和 React Hook 都有多行 JSDoc，无论是否导出。
- [ ] 所有接口、类型、枚举和有领域含义的常量都有多行 JSDoc。
- [ ] 包含业务逻辑的匿名回调已提取为命名函数并完成注释；简单一行回调的豁免合理。
- [ ] 所有重要 Map、缓存、注册表和策略表都有生命周期或合并规则说明。
- [ ] 所有非显然默认值、魔法数和特殊空值都有原因说明。
- [ ] 所有权限、路径、重试、降级和错误映射都有约束说明。
- [ ] 所有 TODO/FIXME/HACK 都有明确原因和退出条件。
- [ ] 没有明显逐行翻译代码的低价值注释。
- [ ] 没有与实现冲突或已经过时的注释。

### 14.2 文档

- [ ] 根 README 的文档导航完整。
- [ ] AGENTS.md 能指向所有工程规范。
- [ ] 核心包和应用拥有 README 或明确的权威文档入口。
- [ ] Runtime、Electron、Renderer 和 Eval 的核心链路可从文档理解。
- [ ] Profile、Capability、Policy、Workflow 和 Verifier 的术语一致。
- [ ] 文档没有大段重复。
- [ ] 所有相对链接有效。
- [ ] 重大架构决策有 ADR 或在权威设计文档中明确记录。

### 14.3 质量检查

- [ ] `pnpm typecheck` 通过。
- [ ] `pnpm lint` 通过。
- [ ] `pnpm dep-check` 通过。
- [ ] `pnpm knip` 通过。
- [ ] `pnpm test` 通过。
- [ ] `pnpm check` 通过。
- [ ] 新增文档检查脚本无误报或已记录合理豁免。
- [ ] Git diff 中没有无关格式化、生成物或锁文件变更。

---

## 15. 最终交付物

Coding Agent 完成后应提交：

1. 修订后的注释规范。
2. 修订后的代码风格规范。
3. 文档维护规范。
4. 全仓源码注释。
5. 核心包和应用 README。
6. 必要的 ADR。
7. 注释覆盖检查脚本。
8. Markdown 链接检查脚本。
9. CI 或 `pnpm check` 集成。
10. 一份执行报告。

执行报告至少包含：

```md
# 注释与文档规范化执行报告

## 修改范围

列出处理过的目录和核心文件。

## 注释覆盖

- 源码文件总数：
- 已有文件头：
- 新增文件头：
- 函数、类、方法、组件和 Hook 总数：
- 已有 JSDoc：
- 新增 JSDoc：
- 豁免数量及原因：

## 文档调整

列出新增、合并、移动和删除的文档。

## 小范围重构

说明为降低认知复杂度所做的提取函数或命名调整。

## 自动检查

说明新增脚本、规则、豁免和 CI 集成。

## 验证结果

记录 typecheck、lint、dep-check、knip、test 和 check 结果。

## 未完成事项

只列出有明确原因、风险或后续 Issue 的项目。
```

---

## 16. 可直接交给 Coding Agent 的任务指令

请根据本方案，对 `Nicander93/my-desktop-agent` 仓库执行全仓代码注释和文档规范化。

重点要求：

1. 所有自有源码文件必须有文件级说明。
2. 所有函数、类、构造函数、类方法、getter/setter、命名箭头函数、React 组件和 Hook 都必须有多行 JSDoc，不区分是否导出。
3. 所有接口、类型、枚举和领域常量必须有多行 JSDoc；复杂内部逻辑还必须说明设计原因、约束、副作用或失败路径。
4. 所有核心状态、缓存、策略、权限和生命周期必须有说明。
5. 注释统一使用中文，代码术语保留英文。
6. 不允许通过逐行翻译代码制造低价值注释。
7. 注释无法解决的复杂度，先进行小范围、无行为变化的重构。
8. 补齐 Runtime、Electron、Renderer、Shared、Eval 和 Scripts 的包级文档。
9. 增加注释覆盖和 Markdown 链接检查，并逐步接入 `pnpm check`。
10. 每批修改后运行类型检查、Lint 和测试。
11. 不修改生成物、锁文件、第三方代码和 Benchmark 原始 fixture。
12. 最终提交执行报告，列明覆盖情况、豁免、检查结果和未完成事项。

执行时先完成规范修订和 P0 核心链路，再按包分批处理全仓。不要一次性机械修改所有文件。
