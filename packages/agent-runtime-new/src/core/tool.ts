import { ToolError } from "@/core/errors.js";
import type { PermissionRequirement } from "@/core/permission.js";
import type { ToolContext } from "@/core/tool-context.js";

export interface ToolMetadata {
  name: string;
  description: string;
  category: "general" | "domain";
}

/**
 * Separates permission discovery from execution; schema and model formatting live outside this contract.
 */
export interface Tool<TInput, TOutput> {
  metadata: ToolMetadata;
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
