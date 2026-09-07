import { ToolError } from "@/core/errors.js";
import { runTool } from "@/core/tool.js";
import {
  createMessageId,
  type ToolCall,
  type ToolMessage,
} from "@/core/message.js";
import type { AnyTool } from "@/tools/registry.js";
import { createToolRegistry } from "@/tools/registry.js";
import type { ToolContext } from "@/core/tool-context.js";

export interface ToolExecutor {
  execute(call: ToolCall): Promise<ToolMessage>;
}

export interface ToolExecutorOptions {
  context: ToolContext;
  tools?: readonly AnyTool[];
  registry?: ReadonlyMap<string, AnyTool>;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isToolExecutorOptions(
  source:
    | ToolExecutorOptions
    | readonly AnyTool[]
    | ReadonlyMap<string, AnyTool>,
): source is ToolExecutorOptions {
  return (
    typeof source === "object" &&
    source !== null &&
    !Array.isArray(source) &&
    !(source instanceof Map) &&
    "context" in source
  );
}

function toRecoverableToolError(error: unknown): ToolError | undefined {
  if (error instanceof ToolError) return error;
  if (!isNodeError(error)) return undefined;

  const codeBySystemError: Record<string, string> = {
    EACCES: "PERMISSION_DENIED",
    EISDIR: "NOT_A_FILE",
    ENOENT: "FILE_NOT_FOUND",
    ENOTDIR: "NOT_A_DIRECTORY",
    EPERM: "PERMISSION_DENIED",
  };
  const code = codeBySystemError[error.code ?? ""];
  return code === undefined ? undefined : new ToolError(error.message, code);
}

function errorMessage(call: ToolCall, error: ToolError): ToolMessage {
  return {
    id: createMessageId(),
    role: "tool",
    toolCallId: call.id,
    content: { code: error.code, message: error.message },
    isError: true,
  };
}

/**
 * Resolves tool calls through the existing registry and permission-aware execution boundary.
 */
export class DefaultToolExecutor implements ToolExecutor {
  private readonly registry: ReadonlyMap<string, AnyTool>;
  private readonly context: ToolContext;

  constructor(options: ToolExecutorOptions);
  constructor(tools: readonly AnyTool[], context: ToolContext);
  constructor(registry: ReadonlyMap<string, AnyTool>, context: ToolContext);
  constructor(
    source: ToolExecutorOptions | readonly AnyTool[],
    context?: ToolContext,
  );
  constructor(
    source:
      | ToolExecutorOptions
      | readonly AnyTool[]
      | ReadonlyMap<string, AnyTool>,
    context?: ToolContext,
  ) {
    if (Array.isArray(source)) {
      if (context === undefined) {
        throw new TypeError("Tool context is required.");
      }
      this.registry = createToolRegistry(source);
      this.context = context;
      return;
    }

    if (source instanceof Map) {
      if (context === undefined) {
        throw new TypeError("Tool context is required.");
      }
      this.registry = source;
      this.context = context;
      return;
    }

    if (!isToolExecutorOptions(source)) {
      throw new TypeError("Invalid tool executor options.");
    }

    if (source.registry !== undefined) {
      this.registry = source.registry;
    } else if (source.tools !== undefined) {
      this.registry = createToolRegistry(source.tools);
    } else {
      throw new TypeError("Either tools or registry is required.");
    }
    this.context = source.context;
  }

  async execute(call: ToolCall): Promise<ToolMessage> {
    const tool = this.registry.get(call.name);
    if (tool === undefined) {
      return errorMessage(
        call,
        new ToolError(`Tool not found: ${call.name}`, "TOOL_NOT_FOUND"),
      );
    }

    try {
      const content = await runTool(tool, call.input, this.context);
      return {
        id: createMessageId(),
        role: "tool",
        toolCallId: call.id,
        content,
      };
    } catch (error) {
      const recoverableError = toRecoverableToolError(error);
      if (recoverableError === undefined) throw error;
      return errorMessage(call, recoverableError);
    }
  }
}

export function createToolExecutor(options: ToolExecutorOptions): ToolExecutor;
export function createToolExecutor(
  tools: readonly AnyTool[],
  context: ToolContext,
): ToolExecutor;
export function createToolExecutor(
  optionsOrTools: ToolExecutorOptions | readonly AnyTool[],
  context?: ToolContext,
): ToolExecutor {
  return context === undefined
    ? new DefaultToolExecutor(optionsOrTools)
    : new DefaultToolExecutor(optionsOrTools, context);
}
