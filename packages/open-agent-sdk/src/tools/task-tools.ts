/**
 * Task Management Tools
 *
 * TaskCreate, TaskList, TaskUpdate, TaskGet, TaskStop, TaskOutput
 *
 * Provides in-memory task tracking for agent coordination.
 * Tasks persist across turns within a session.
 */

import type { ToolDefinition, ToolContext, ToolResult } from "../types.js";

/**
 * Task status.
 */
/** 会话内任务的生命周期状态；取消与失败均为终态。 */
export type TaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Task entry.
 */
/** Agent 协作期间保存在内存中的任务条目。 */
export interface Task {
  id: string;
  subject: string;
  description?: string;
  status: TaskStatus;
  owner?: string;
  createdAt: string;
  updatedAt: string;
  output?: string;
  blockedBy?: string[];
  blocks?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Global task store (shared across tools in a session).
 */
/** 当前 session 的任务存储；不跨进程或 session 持久化。 */
const taskStore = new Map<string, Task>();

let taskCounter = 0;

/**
 * Get all tasks.
 */
/** 返回当前任务快照，调用者不得依赖跨 session 的稳定性。 */
export function getAllTasks(): Task[] {
  return Array.from(taskStore.values());
}

/**
 * Get a task by ID.
 */
/** 按 ID 读取任务。 */
export function getTask(id: string): Task | undefined {
  return taskStore.get(id);
}

/**
 * Clear all tasks (for session reset).
 */
/** 清空 session 任务并重置 ID 计数，供 session 重置使用。 */
export function clearTasks(): void {
  taskStore.clear();
  taskCounter = 0;
}

// ============================================================================
// TaskCreateTool
// ============================================================================

/** 创建任务的写工具；任务只用于同一 Agent session 的协调与进度表达。 */
export const TaskCreateTool: ToolDefinition = {
  name: "TaskCreate",
  description:
    "Create a new task for tracking work progress. Tasks help organize multi-step operations.",
  inputSchema: {
    type: "object",
    properties: {
      subject: { type: "string", description: "Short task title" },
      description: { type: "string", description: "Detailed task description" },
      owner: { type: "string", description: "Task owner/assignee" },
      status: {
        type: "string",
        enum: ["pending", "in_progress"],
        description: "Initial status",
      },
    },
    required: ["subject"],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => true,
  isEnabled: () => true,
  /** 向模型解释该工具的协作目的。 */
  async prompt() {
    return "Create a task for tracking progress.";
  },
  /** 分配单调 ID 并写入内存任务存储。 */
  async call(input: any): Promise<ToolResult> {
    const id = `task_${++taskCounter}`;
    const task: Task = {
      id,
      subject: input.subject,
      description: input.description,
      status: input.status || "pending",
      owner: input.owner,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    taskStore.set(id, task);

    return {
      type: "tool_result",
      tool_use_id: "",
      content: `Task created: ${id} - "${task.subject}" (${task.status})`,
    };
  },
};

// ============================================================================
// TaskListTool
// ============================================================================

/** 查询任务列表的只读工具，可按状态或 owner 筛选。 */
export const TaskListTool: ToolDefinition = {
  name: "TaskList",
  description: "List all tasks with their status, ownership, and dependencies.",
  inputSchema: {
    type: "object",
    properties: {
      status: { type: "string", description: "Filter by status" },
      owner: { type: "string", description: "Filter by owner" },
    },
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  isEnabled: () => true,
  /** 提供简短模型提示，避免无关的管理语义进入系统提示。 */
  async prompt() {
    return "List tasks.";
  },
  /** 以稳定文本摘要返回筛选后的任务。 */
  async call(input: any): Promise<ToolResult> {
    let tasks = getAllTasks();

    if (input.status) {
      tasks = tasks.filter((t) => t.status === input.status);
    }
    if (input.owner) {
      tasks = tasks.filter((t) => t.owner === input.owner);
    }

    if (tasks.length === 0) {
      return {
        type: "tool_result",
        tool_use_id: "",
        content: "No tasks found.",
      };
    }

    const lines = tasks.map(
      (t) =>
        `[${t.id}] ${t.status.toUpperCase()} - ${t.subject}${t.owner ? ` (owner: ${t.owner})` : ""}`,
    );

    return {
      type: "tool_result",
      tool_use_id: "",
      content: lines.join("\n"),
    };
  },
};

// ============================================================================
// TaskUpdateTool
// ============================================================================

/** 更新任务状态或交接信息的写工具。 */
export const TaskUpdateTool: ToolDefinition = {
  name: "TaskUpdate",
  description: "Update a task's status, description, or other properties.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Task ID" },
      status: {
        type: "string",
        enum: ["pending", "in_progress", "completed", "failed", "cancelled"],
      },
      description: { type: "string", description: "Updated description" },
      owner: { type: "string", description: "New owner" },
      output: { type: "string", description: "Task output/result" },
    },
    required: ["id"],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => true,
  isEnabled: () => true,
  /** 说明该工具只改变已有任务。 */
  async prompt() {
    return "Update a task.";
  },
  /** 原地更新已存在任务并刷新时间戳。 */
  async call(input: any): Promise<ToolResult> {
    const task = taskStore.get(input.id);
    if (!task) {
      return {
        type: "tool_result",
        tool_use_id: "",
        content: `Task not found: ${input.id}`,
        is_error: true,
      };
    }

    if (input.status) task.status = input.status;
    if (input.description) task.description = input.description;
    if (input.owner) task.owner = input.owner;
    if (input.output) task.output = input.output;
    task.updatedAt = new Date().toISOString();

    return {
      type: "tool_result",
      tool_use_id: "",
      content: `Task updated: ${task.id} - ${task.status} - "${task.subject}"`,
    };
  },
};

// ============================================================================
// TaskGetTool
// ============================================================================

/** 获取完整任务对象的只读工具。 */
export const TaskGetTool: ToolDefinition = {
  name: "TaskGet",
  description: "Get full details of a specific task.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Task ID" },
    },
    required: ["id"],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  isEnabled: () => true,
  /** 说明返回单个任务详情。 */
  async prompt() {
    return "Get task details.";
  },
  /** 以 JSON 保留任务元数据和依赖关系。 */
  async call(input: any): Promise<ToolResult> {
    const task = taskStore.get(input.id);
    if (!task) {
      return {
        type: "tool_result",
        tool_use_id: "",
        content: `Task not found: ${input.id}`,
        is_error: true,
      };
    }

    return {
      type: "tool_result",
      tool_use_id: "",
      content: JSON.stringify(task, null, 2),
    };
  },
};

// ============================================================================
// TaskStopTool
// ============================================================================

/** 取消运行中任务的写工具；取消原因写入 output 供后续 Agent 判断。 */
export const TaskStopTool: ToolDefinition = {
  name: "TaskStop",
  description: "Stop/cancel a running task.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Task ID to stop" },
      reason: { type: "string", description: "Reason for stopping" },
    },
    required: ["id"],
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => true,
  isEnabled: () => true,
  /** 说明该调用产生取消终态。 */
  async prompt() {
    return "Stop a task.";
  },
  /** 标记取消并可选保存可读停止原因。 */
  async call(input: any): Promise<ToolResult> {
    const task = taskStore.get(input.id);
    if (!task) {
      return {
        type: "tool_result",
        tool_use_id: "",
        content: `Task not found: ${input.id}`,
        is_error: true,
      };
    }

    task.status = "cancelled";
    task.updatedAt = new Date().toISOString();
    if (input.reason) task.output = `Stopped: ${input.reason}`;

    return {
      type: "tool_result",
      tool_use_id: "",
      content: `Task stopped: ${task.id}`,
    };
  },
};

// ============================================================================
// TaskOutputTool
// ============================================================================

/** 获取任务输出的只读工具，不改变任务状态。 */
export const TaskOutputTool: ToolDefinition = {
  name: "TaskOutput",
  description: "Get the output/result of a task.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Task ID" },
    },
    required: ["id"],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  isEnabled: () => true,
  /** 说明该调用只读取已有结果。 */
  async prompt() {
    return "Get task output.";
  },
  /** 返回尚未写入 output 时的显式占位文本。 */
  async call(input: any): Promise<ToolResult> {
    const task = taskStore.get(input.id);
    if (!task) {
      return {
        type: "tool_result",
        tool_use_id: "",
        content: `Task not found: ${input.id}`,
        is_error: true,
      };
    }

    return {
      type: "tool_result",
      tool_use_id: "",
      content: task.output || "(no output yet)",
    };
  },
};
