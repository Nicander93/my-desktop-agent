/**
 * Cron/Scheduling Tools
 *
 * CronCreate, CronDelete, CronList - Schedule recurring tasks.
 * RemoteTrigger - Manage remote scheduled agent triggers.
 */

import type { ToolDefinition, ToolResult } from "./types.js";

/**
 * Cron job definition.
 */
/** 当前 SDK session 内保存的定时任务描述；不代表系统级持久化调度。 */
export interface CronJob {
  id: string;
  name: string;
  schedule: string; // cron expression
  command: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
}

/** 内存 cron 存储，session 结束后自动失效。 */
const cronStore = new Map<string, CronJob>();
let cronCounter = 0;

/**
 * Get all cron jobs.
 */
/** 返回当前 session 的 cron 任务快照。 */
export function getAllCronJobs(): CronJob[] {
  return Array.from(cronStore.values());
}

/**
 * Clear all cron jobs.
 */
/** 清空所有内存定时任务并重置 ID 计数，供 session 重置使用。 */
export function clearCronJobs(): void {
  cronStore.clear();
  cronCounter = 0;
}

/** 创建会话内 cron 任务的写工具；实际调度由宿主集成负责。 */
export const CronCreateTool: ToolDefinition = {
  name: "CronCreate",
  description:
    "Create a scheduled recurring task (cron job). Supports cron expressions for scheduling.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Job name" },
      schedule: {
        type: "string",
        description:
          'Cron expression (e.g., "*/5 * * * *" for every 5 minutes)',
      },
      command: { type: "string", description: "Command or prompt to execute" },
    },
    required: ["name", "schedule", "command"],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => true,
  isEnabled: () => true,
  /** 向模型说明任务仅用于本地调度描述。 */
  async prompt() {
    return "Create a scheduled cron job.";
  },
  /** 分配 ID 并写入内存存储，不验证或执行 cron 表达式。 */
  async call(input: any): Promise<ToolResult> {
    const id = `cron_${++cronCounter}`;
    const job: CronJob = {
      id,
      name: input.name,
      schedule: input.schedule,
      command: input.command,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    cronStore.set(id, job);

    return {
      type: "tool_result",
      tool_use_id: "",
      content: `Cron job created: ${id} "${job.name}" schedule="${job.schedule}"`,
    };
  },
};

/** 删除会话内 cron 任务的写工具。 */
export const CronDeleteTool: ToolDefinition = {
  name: "CronDelete",
  description: "Delete a scheduled cron job.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Cron job ID to delete" },
    },
    required: ["id"],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => true,
  isEnabled: () => true,
  /** 说明该调用需要已存在的任务 ID。 */
  async prompt() {
    return "Delete a cron job.";
  },
  /** 删除目标任务，不存在时返回模型可见错误。 */
  async call(input: any): Promise<ToolResult> {
    if (!cronStore.has(input.id)) {
      return {
        type: "tool_result",
        tool_use_id: "",
        content: `Cron job not found: ${input.id}`,
        is_error: true,
      };
    }
    cronStore.delete(input.id);
    return {
      type: "tool_result",
      tool_use_id: "",
      content: `Cron job deleted: ${input.id}`,
    };
  },
};

/** 读取当前 session cron 任务的只读工具。 */
export const CronListTool: ToolDefinition = {
  name: "CronList",
  description: "List all scheduled cron jobs.",
  inputSchema: { type: "object", properties: {} },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  isEnabled: () => true,
  /** 说明该调用只读取调度描述。 */
  async prompt() {
    return "List cron jobs.";
  },
  /** 返回截断命令预览，避免列表泄漏过长 prompt。 */
  async call(): Promise<ToolResult> {
    const jobs = getAllCronJobs();
    if (jobs.length === 0) {
      return {
        type: "tool_result",
        tool_use_id: "",
        content: "No cron jobs scheduled.",
      };
    }
    const lines = jobs.map(
      (j) =>
        `[${j.id}] ${j.enabled ? "✓" : "✗"} "${j.name}" schedule="${j.schedule}" command="${j.command.slice(0, 50)}"`,
    );
    return { type: "tool_result", tool_use_id: "", content: lines.join("\n") };
  },
};

/** 远程调度协议占位工具；独立 SDK 不会伪造远程状态。 */
export const RemoteTriggerTool: ToolDefinition = {
  name: "RemoteTrigger",
  description:
    "Manage remote scheduled agent triggers. Supports list, get, create, update, and run operations.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "get", "create", "update", "run"],
        description: "Operation to perform",
      },
      id: { type: "string", description: "Trigger ID (for get/update/run)" },
      name: { type: "string", description: "Trigger name (for create)" },
      schedule: {
        type: "string",
        description: "Cron schedule (for create/update)",
      },
      prompt: {
        type: "string",
        description: "Agent prompt (for create/update)",
      },
    },
    required: ["action"],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => true,
  isEnabled: () => true,
  /** 提示模型远程调度需要宿主后端。 */
  async prompt() {
    return "Manage remote agent triggers.";
  },
  /** 返回明确降级说明，引导独立模式改用本地 cron 工具。 */
  async call(input: any): Promise<ToolResult> {
    // RemoteTrigger operations are typically handled by the remote backend
    // In standalone SDK mode, we provide a stub implementation
    return {
      type: "tool_result",
      tool_use_id: "",
      content: `RemoteTrigger ${input.action}: This feature requires a connected remote backend. In standalone SDK mode, use CronCreate/CronList/CronDelete for local scheduling.`,
    };
  },
};
