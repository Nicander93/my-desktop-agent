import { ToolError } from "@/core/errors.js";
import type { PermissionRequirement } from "@/core/permission.js";
import type { ToolContext } from "@/core/tool-context.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema?: Readonly<Record<string, unknown>>;
}

/**
 * Separates permission discovery from execution while keeping the model-facing
 * definition attached to the executable tool.
 */
export interface Tool<TInput, TOutput> {
  definition: ToolDefinition;
  getPermissionRequirements(
    input: TInput,
    context: ToolContext,
  ): Promise<PermissionRequirement[]>;
  execute(input: TInput, context: ToolContext): Promise<TOutput>;
}

/**
 * Executes a tool only after every declared permission requirement is approved.
 */
export async function runTool<TInput, TOutput>(
  tool: Tool<TInput, TOutput>,
  input: TInput,
  context: ToolContext,
): Promise<TOutput> {
  const requirements = await tool.getPermissionRequirements(input, context);

  if (context.permissionEngine) {
    for (const requirement of requirements) {
      const decision = await context.permissionEngine.check(
        requirement,
        context,
      );
      if (!decision.allowed) {
        throw new ToolError(
          `Permission denied: ${decision.reason}`,
          "PERMISSION_DENIED",
        );
      }
    }
  }

  return tool.execute(input, context);
}
