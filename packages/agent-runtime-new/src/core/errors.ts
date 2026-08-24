/**
 * Predictable tool failure whose code can be classified without parsing its message.
 */
export class ToolError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export class PathScopeError extends ToolError {
  constructor(path: string) {
    super(
      `Path is outside the allowed workspace scope: ${path}`,
      "PATH_OUTSIDE_WORKSPACE",
    );
    this.name = "PathScopeError";
  }
}

export class BinaryFileError extends ToolError {
  constructor(path: string) {
    super(
      `Binary files are not supported by this text tool: ${path}`,
      "BINARY_FILE",
    );
    this.name = "BinaryFileError";
  }
}
