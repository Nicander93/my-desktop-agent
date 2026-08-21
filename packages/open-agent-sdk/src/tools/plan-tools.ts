/**
 * Plan Mode Tools
 *
 * EnterPlanMode / ExitPlanMode - Structured planning workflow.
 * Allows the agent to enter a design/planning phase before execution.
 */

import type { ToolDefinition, ToolResult } from "./types.js";

// Track plan mode state
let planModeActive = false;
let currentPlan: string | null = null;

/**
 * 返回进程内计划模式是否已被 EnterPlanModeTool 激活。
 */
export function isPlanModeActive(): boolean {
  return planModeActive;
}

/**
 * 返回最近一次退出计划模式时记录的计划文本，尚未记录时返回空值。
 */
export function getCurrentPlan(): string | null {
  return currentPlan;
}

export const EnterPlanModeTool: ToolDefinition = {
  name: "EnterPlanMode",
  description:
    "Enter plan/design mode for complex tasks. In plan mode, the agent focuses on designing the approach before executing.",
  inputSchema: {
    type: "object",
    properties: {},
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  isEnabled: () => true,
  /**
   * 向模型说明此工具仅切换到结构化规划阶段。
   */
  async prompt() {
    return "Enter plan mode for structured planning.";
  },
  /**
   * 激活计划模式并清除旧计划；重复进入不会覆盖当前规划状态。
   */
  async call(): Promise<ToolResult> {
    if (planModeActive) {
      return {
        type: "tool_result",
        tool_use_id: "",
        content: "Already in plan mode.",
      };
    }

    planModeActive = true;
    currentPlan = null;

    return {
      type: "tool_result",
      tool_use_id: "",
      content:
        "Entered plan mode. Design your approach before executing. Use ExitPlanMode when the plan is ready.",
    };
  },
};

export const ExitPlanModeTool: ToolDefinition = {
  name: "ExitPlanMode",
  description:
    "Exit plan mode with a completed plan. The plan will be recorded and execution can proceed.",
  inputSchema: {
    type: "object",
    properties: {
      plan: { type: "string", description: "The completed plan" },
      approved: {
        type: "boolean",
        description: "Whether the plan is approved for execution",
      },
    },
  },
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  isEnabled: () => true,
  /**
   * 向模型说明退出需要提交完整计划及可选审批状态。
   */
  async prompt() {
    return "Exit plan mode with a completed plan.";
  },
  /**
   * 仅在计划模式已激活时记录计划并退出；否则返回明确的工具错误。
   */
  async call(input: any): Promise<ToolResult> {
    if (!planModeActive) {
      return {
        type: "tool_result",
        tool_use_id: "",
        content: "Not in plan mode.",
        is_error: true,
      };
    }

    planModeActive = false;
    currentPlan = input.plan || null;

    const status = input.approved !== false ? "approved" : "pending approval";

    return {
      type: "tool_result",
      tool_use_id: "",
      content: `Plan mode exited. Plan status: ${status}.${currentPlan ? `\n\nPlan:\n${currentPlan}` : ""}`,
    };
  },
};
