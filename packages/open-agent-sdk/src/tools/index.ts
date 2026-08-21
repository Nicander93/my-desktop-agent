/**
 * SDK 内置工具注册表与工具池组装入口。
 *
 * 本文件只维护 SDK 工具定义的顺序和筛选，不决定 Desktop Profile 权限；Runtime 会在此基础上叠加 Execution Policy。
 */

import type { ToolDefinition } from "./types.js";

// File I/O
import { BashTool } from "./bash.js";
import { FileReadTool } from "./read.js";
import { FileWriteTool } from "./write.js";
import { FileEditTool } from "./edit.js";
import { GlobTool } from "./glob.js";
import { GrepTool } from "./grep.js";
import { NotebookEditTool } from "./notebook-edit.js";

// Web
import { WebFetchTool } from "./web-fetch.js";
import { WebSearchTool } from "./web-search.js";

// Agent & Multi-agent
import { AgentTool } from "./agent-tool.js";
import { SendMessageTool } from "./send-message.js";
import { TeamCreateTool, TeamDeleteTool } from "./team-tools.js";

// Tasks
import {
  TaskCreateTool,
  TaskListTool,
  TaskUpdateTool,
  TaskGetTool,
  TaskStopTool,
  TaskOutputTool,
} from "./task-tools.js";

// Worktree
import { EnterWorktreeTool, ExitWorktreeTool } from "./worktree-tools.js";

// Planning
import { EnterPlanModeTool, ExitPlanModeTool } from "./plan-tools.js";

// User interaction
import { AskUserQuestionTool } from "./ask-user.js";

// Discovery
import { ToolSearchTool } from "./tool-search.js";

// MCP Resources
import {
  ListMcpResourcesTool,
  ReadMcpResourceTool,
} from "./mcp-resource-tools.js";

// Scheduling
import {
  CronCreateTool,
  CronDeleteTool,
  CronListTool,
  RemoteTriggerTool,
} from "./cron-tools.js";

// LSP
import { LSPTool } from "./lsp-tool.js";

// Config
import { ConfigTool } from "./config-tool.js";

// Todo
import { TodoWriteTool } from "./todo-tool.js";

// Skill
import { SkillTool } from "./skill-tool.js";

/**
 * SDK 默认提供的全部工具定义。
 *
 * 顺序只影响同名工具去重时的“后者覆盖前者”语义；新增工具需同时检查 Provider、权限和 Runtime Profile 白名单。
 */
const ALL_TOOLS: ToolDefinition[] = [
  // Core file I/O & execution
  BashTool,
  FileReadTool,
  FileWriteTool,
  FileEditTool,
  GlobTool,
  GrepTool,
  NotebookEditTool,

  // Web
  WebFetchTool,
  WebSearchTool,

  // Agent & Multi-agent
  AgentTool,
  SendMessageTool,
  TeamCreateTool,
  TeamDeleteTool,

  // Tasks
  TaskCreateTool,
  TaskListTool,
  TaskUpdateTool,
  TaskGetTool,
  TaskStopTool,
  TaskOutputTool,

  // Worktree
  EnterWorktreeTool,
  ExitWorktreeTool,

  // Planning
  EnterPlanModeTool,
  ExitPlanModeTool,

  // User interaction
  AskUserQuestionTool,

  // Discovery
  ToolSearchTool,

  // MCP Resources
  ListMcpResourcesTool,
  ReadMcpResourceTool,

  // Scheduling
  CronCreateTool,
  CronDeleteTool,
  CronListTool,
  RemoteTriggerTool,

  // LSP
  LSPTool,

  // Config
  ConfigTool,

  // Todo
  TodoWriteTool,

  // Skill
  SkillTool,
];

/**
 * 返回内置工具列表的浅副本。
 *
 * 调用方可筛选或追加工具，但不能通过返回数组修改全局注册表。
 */
export function getAllBaseTools(): ToolDefinition[] {
  return [...ALL_TOOLS];
}

/**
 * 按允许和禁止列表筛选工具。
 *
 * allow-list 先收窄候选集，deny-list 后应用，确保显式禁止始终优先于同一次调用的允许项。
 */
export function filterTools(
  tools: ToolDefinition[],
  allowedTools?: string[],
  disallowedTools?: string[],
): ToolDefinition[] {
  let filtered = tools;

  if (allowedTools && allowedTools.length > 0) {
    const allowed = new Set(allowedTools);
    filtered = filtered.filter((t) => allowed.has(t.name));
  }

  if (disallowedTools && disallowedTools.length > 0) {
    const disallowed = new Set(disallowedTools);
    filtered = filtered.filter((t) => !disallowed.has(t.name));
  }

  return filtered;
}

/**
 * 合并基础与 MCP 工具，并按名称去重后应用权限筛选。
 *
 * 后出现的定义覆盖先出现的同名工具，使调用方能以 MCP 或自定义实现替换基础工具；最终仍由 Runtime 许可决定可用性。
 */
export function assembleToolPool(
  baseTools: ToolDefinition[],
  mcpTools: ToolDefinition[] = [],
  allowedTools?: string[],
  disallowedTools?: string[],
): ToolDefinition[] {
  const combined = [...baseTools, ...mcpTools];

  // Deduplicate by name (later definitions override)
  const byName = new Map<string, ToolDefinition>();
  for (const tool of combined) {
    byName.set(tool.name, tool);
  }

  let tools = Array.from(byName.values());
  return filterTools(tools, allowedTools, disallowedTools);
}

// Re-export individual tools
export {
  // Core
  BashTool,
  FileReadTool,
  FileWriteTool,
  FileEditTool,
  GlobTool,
  GrepTool,
  NotebookEditTool,
  WebFetchTool,
  WebSearchTool,
  // Agent
  AgentTool,
  SendMessageTool,
  TeamCreateTool,
  TeamDeleteTool,
  // Tasks
  TaskCreateTool,
  TaskListTool,
  TaskUpdateTool,
  TaskGetTool,
  TaskStopTool,
  TaskOutputTool,
  // Worktree
  EnterWorktreeTool,
  ExitWorktreeTool,
  // Planning
  EnterPlanModeTool,
  ExitPlanModeTool,
  // User
  AskUserQuestionTool,
  // Discovery
  ToolSearchTool,
  // MCP
  ListMcpResourcesTool,
  ReadMcpResourceTool,
  // Scheduling
  CronCreateTool,
  CronDeleteTool,
  CronListTool,
  RemoteTriggerTool,
  // LSP
  LSPTool,
  // Config
  ConfigTool,
  // Todo
  TodoWriteTool,
  // Skill
  SkillTool,
};

// Re-export helpers
export { defineTool } from "./define.js";
