import { stat } from "node:fs/promises";
import path from "node:path";
import { ToolError } from "@/core/errors.js";
import type { ToolContext } from "@/core/tool-context.js";
import type { Tool } from "@/core/tool.js";
import { resolveSearchLimit } from "@/tools/utils/limit.js";
import { resolveToolPath, searchOutputPathToWorkspace } from "@/tools/utils/path.js";
import { runProcess } from "@/tools/utils/process.js";

export interface GrepInput {
  pattern: string;
  /**
   * File or directory to search. Defaults to the workspace root.
   */
  path?: string;
  glob?: string;
  /**
   * Defaults to `files` to keep broad searches out of the model context.
   */
  mode?: "files" | "content" | "count";
  ignoreCase?: boolean;
  /**
   * Symmetric context line count used only in `content` mode.
   */
  context?: number;
  limit?: number;
  multiline?: boolean;
}

export interface GrepContextLine {
  line: number;
  text: string;
}

export interface GrepContentMatch {
  path: string;
  line: number;
  column: number;
  text: string;
  before?: GrepContextLine[];
  after?: GrepContextLine[];
}

export type GrepOutput =
  | { mode: "files"; files: string[]; returned: number; truncated: boolean }
  | {
      mode: "content";
      matches: GrepContentMatch[];
      returned: number;
      truncated: boolean;
    }
  | { mode: "count"; files: number; matches: number };

interface RipgrepPath {
  text?: string;
}

interface RipgrepJsonLineEvent {
  type: "match" | "context";
  data: {
    path: RipgrepPath;
    lines: { text: string };
    line_number: number;
    submatches: Array<{ start: number; end: number; match: { text: string } }>;
  };
}

interface RipgrepJsonSummary {
  type: "summary";
  data: { stats: { matches: number; searches_with_match: number } };
}

interface ParsedRipgrepJson {
  matches: RipgrepJsonLineEvent[];
  contexts: RipgrepJsonLineEvent[];
  summary?: RipgrepJsonSummary;
}

function isLineEvent(value: unknown): value is RipgrepJsonLineEvent {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return type === "match" || type === "context";
}

function isSummaryEvent(value: unknown): value is RipgrepJsonSummary {
  if (!value || typeof value !== "object") return false;
  return (value as { type?: unknown }).type === "summary";
}

function parseRipgrepJson(stdout: string): ParsedRipgrepJson {
  const parsed: ParsedRipgrepJson = { matches: [], contexts: [] };
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch (error) {
      throw new ToolError(
        `Failed to parse ripgrep JSON output: ${String(error)}`,
        "RG_JSON_PARSE_FAILED",
      );
    }

    if (isLineEvent(event)) {
      if (event.type === "match") parsed.matches.push(event);
      else parsed.contexts.push(event);
    } else if (isSummaryEvent(event)) {
      parsed.summary = event;
    }
  }
  return parsed;
}

function byteOffsetToColumn(text: string, byteOffset: number): number {
  return (
    Buffer.from(text, "utf8").subarray(0, byteOffset).toString("utf8").length +
    1
  );
}

function toContentMatches(
  parsed: ParsedRipgrepJson,
  searchCwd: string,
  contextLines: number,
  context: ToolContext,
): GrepContentMatch[] {
  const normalizedContexts = parsed.contexts.map((event) => ({
    path: event.data.path.text ?? "",
    line: event.data.line_number,
    text: event.data.lines.text.replace(/[\r\n]+$/, ""),
  }));

  return parsed.matches.map((event) => {
    const outputPath = event.data.path.text ?? "";
    if (!outputPath) {
      throw new ToolError(
        "ripgrep returned a non-text path that this version cannot represent.",
        "UNSUPPORTED_PATH_ENCODING",
      );
    }

    const firstSubmatch = event.data.submatches[0];
    const lineText = event.data.lines.text.replace(/[\r\n]+$/, "");
    const relevant =
      contextLines > 0
        ? normalizedContexts.filter(
            (candidate) =>
              candidate.path === outputPath &&
              Math.abs(candidate.line - event.data.line_number) <= contextLines,
          )
        : [];
    const before = relevant
      .filter((candidate) => candidate.line < event.data.line_number)
      .map(({ line, text }) => ({ line, text }));
    const after = relevant
      .filter((candidate) => candidate.line > event.data.line_number)
      .map(({ line, text }) => ({ line, text }));

    return {
      path: searchOutputPathToWorkspace(outputPath, searchCwd, context),
      line: event.data.line_number,
      column: byteOffsetToColumn(lineText, firstSubmatch?.start ?? 0),
      text: lineText,
      ...(before.length > 0 ? { before } : {}),
      ...(after.length > 0 ? { after } : {}),
    };
  });
}

export const grepTool: Tool<GrepInput, GrepOutput> = {
  definition: {
    name: "grep",
    description:
      "Search text contents with ripgrep. Defaults to returning only matching file paths.",
  },

  async getPermissionRequirements(input, context) {
    const searchPath = resolveToolPath(input.path, context);
    return [
      {
        kind: "filesystem.read",
        resource: searchPath,
        reason: "Search file contents",
      },
    ];
  },

  async execute(input, context) {
    if (
      input.context !== undefined &&
      (!Number.isInteger(input.context) || input.context < 0)
    ) {
      throw new ToolError(
        "context must be a non-negative integer.",
        "INVALID_ARGUMENT",
      );
    }

    const targetPath = resolveToolPath(input.path, context);
    const info = await stat(targetPath);
    const searchCwd = info.isDirectory()
      ? targetPath
      : path.dirname(targetPath);
    const targetArg = info.isDirectory() ? "." : path.basename(targetPath);
    const mode = input.mode ?? "files";
    const limit = resolveSearchLimit(input.limit, context);

    const commonArgs: string[] = ["--color", "never"];
    if (input.ignoreCase) commonArgs.push("--ignore-case");
    if (input.glob) commonArgs.push("--glob", input.glob);
    if (input.multiline) commonArgs.push("--multiline", "--multiline-dotall");

    if (mode === "files") {
      const result = await runProcess({
        command: context.binaries?.rg ?? "rg",
        args: [
          ...commonArgs,
          "--files-with-matches",
          "--null",
          "--",
          input.pattern,
          targetArg,
        ],
        cwd: searchCwd,
        timeoutMs: context.limits.searchTimeoutMs,
        maxOutputBytes: context.limits.maxProcessOutputBytes,
        allowedExitCodes: [0, 1],
      });
      const files = result.stdout
        .split("\0")
        .filter(Boolean)
        .map((file) => searchOutputPathToWorkspace(file, searchCwd, context))
        .sort();
      return {
        mode: "files",
        files: files.slice(0, limit),
        returned: Math.min(files.length, limit),
        truncated: files.length > limit,
      };
    }

    const contentArgs = [...commonArgs, "--json"];
    if (mode === "content" && input.context !== undefined) {
      contentArgs.push("--context", String(input.context));
    }
    contentArgs.push("--", input.pattern, targetArg);

    const result = await runProcess({
      command: context.binaries?.rg ?? "rg",
      args: contentArgs,
      cwd: searchCwd,
      timeoutMs: context.limits.searchTimeoutMs,
      maxOutputBytes: context.limits.maxProcessOutputBytes,
      allowedExitCodes: [0, 1],
    });
    const parsed = parseRipgrepJson(result.stdout);

    if (mode === "count") {
      return {
        mode: "count",
        files: parsed.summary?.data.stats.searches_with_match ?? 0,
        matches: parsed.summary?.data.stats.matches ?? 0,
      };
    }

    const matches = toContentMatches(
      parsed,
      searchCwd,
      input.context ?? 0,
      context,
    );
    return {
      mode: "content",
      matches: matches.slice(0, limit),
      returned: Math.min(matches.length, limit),
      truncated: matches.length > limit,
    };
  },
};
