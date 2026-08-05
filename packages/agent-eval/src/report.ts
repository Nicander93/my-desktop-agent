/**
 * 汇总 eval-results 下的 result.json，生成 Markdown 报告。
 * 只统计 verifier 结论，不把 agent 自述当通过。
 * groupBy 可读 benchmarks/tasks/<id>/metadata.yaml 做 domain/difficulty 分组。
 */
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { EvaluationResult } from "@desktop-agent/shared";

/** 聚合数字，供 CLI 与 CI 摘要 */
export interface EvaluationReportSummary {
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  errorRuns: number;
  timeoutRuns: number;
  medianDurationMs: number;
  byTask: Array<{ taskId: string; runs: number; passed: number }>;
  byGroup?: Array<{ key: string; runs: number; passed: number }>;
  failures: Record<string, number>;
}

/**
 * 渲染报告时的元数据分组、任务根目录和诊断结果过滤选项。
 */
export interface RenderReportOptions {
  groupBy?: Array<"domain" | "difficulty" | "task">;
  benchmarksRoot?: string;
  /** 诊断子目录结果默认排除出主榜 */
  excludeDiagnose?: boolean;
}

/** 按 taskId 分组统计通过数与中位耗时 */
export function summarizeResults(
  results: EvaluationResult[],
  options: RenderReportOptions = {},
): EvaluationReportSummary {
  const filtered =
    options.excludeDiagnose === false
      ? results
      : results.filter(
          (result) =>
            !result.artifacts.resultPath
              .replace(/\\/g, "/")
              .includes("/diagnose/"),
        );
  const durations = filtered
    .map((result) => result.durationMs)
    .sort((a, b) => a - b);
  const grouped = new Map<string, EvaluationResult[]>();
  for (const result of filtered)
    grouped.set(result.taskId, [...(grouped.get(result.taskId) ?? []), result]);
  return {
    totalRuns: filtered.length,
    passedRuns: filtered.filter((result) => result.status === "passed").length,
    failedRuns: filtered.filter((result) => result.status === "failed").length,
    errorRuns: filtered.filter((result) => result.status === "error").length,
    timeoutRuns: filtered.filter((result) => result.status === "timeout")
      .length,
    medianDurationMs:
      durations.length === 0 ? 0 : durations[Math.floor(durations.length / 2)]!,
    byTask: [...grouped.entries()]
      .map(([taskId, taskResults]) => ({
        taskId,
        runs: taskResults.length,
        passed: taskResults.filter((result) => result.status === "passed")
          .length,
      }))
      .sort((a, b) => a.taskId.localeCompare(b.taskId)),
    failures: Object.fromEntries(
      ["agent", "environment", "verifier", "timeout"].map((category) => [
        category,
        filtered.filter((result) => result.failure?.category === category)
          .length,
      ]),
    ),
  };
}

/**
 * 在基础汇总之上异步读取任务 metadata，并按请求的维度填充聚合桶。
 */
export async function summarizeResultsWithGroups(
  results: EvaluationResult[],
  options: RenderReportOptions = {},
): Promise<EvaluationReportSummary> {
  const summary = summarizeResults(results, options);
  const groupBy = options.groupBy?.filter((g) => g !== "task") ?? [];
  if (groupBy.length === 0) return summary;
  const benchmarksRoot = resolve(options.benchmarksRoot ?? "benchmarks/tasks");
  const buckets = new Map<string, EvaluationResult[]>();
  const filtered =
    options.excludeDiagnose === false
      ? results
      : results.filter(
          (result) =>
            !result.artifacts.resultPath
              .replace(/\\/g, "/")
              .includes("/diagnose/"),
        );
  for (const result of filtered) {
    const meta = await readTaskMeta(benchmarksRoot, result.taskId);
    const parts = groupBy.map((key) => {
      if (key === "domain") return meta.domain ?? "unknown-domain";
      return meta.difficulty ?? "unknown-difficulty";
    });
    const bucketKey = parts.join("/");
    buckets.set(bucketKey, [...(buckets.get(bucketKey) ?? []), result]);
  }
  summary.byGroup = [...buckets.entries()]
    .map(([key, taskResults]) => ({
      key,
      runs: taskResults.length,
      passed: taskResults.filter((result) => result.status === "passed").length,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return summary;
}

/**
 * 尽力读取单任务的报告分组字段；缺失或损坏 metadata 使用空分组数据。
 */
async function readTaskMeta(
  benchmarksRoot: string,
  taskId: string,
): Promise<{ domain?: string; difficulty?: string }> {
  const path = join(benchmarksRoot, taskId, "metadata.yaml");
  try {
    await access(path, constants.F_OK);
    const raw = parseYaml(await readFile(path, "utf8")) as {
      domain?: string;
      difficulty?: { level?: string };
    };
    return { domain: raw.domain, difficulty: raw.difficulty?.level };
  } catch {
    return {};
  }
}

/** 输出 Markdown 字符串，不写盘 */
export function renderReport(
  results: EvaluationResult[],
  summary?: EvaluationReportSummary,
): string {
  const resolved = summary ?? summarizeResults(results);
  const groupSection = resolved.byGroup?.length
    ? [
        "## Groups",
        "",
        "| Group | Runs | Passed |",
        "| --- | ---: | ---: |",
        ...resolved.byGroup.map(
          (group) => `| ${group.key} | ${group.runs} | ${group.passed} |`,
        ),
        "",
      ]
    : [];
  return [
    "# Agent Eval Report",
    "",
    `- Runs: ${resolved.totalRuns}`,
    `- Passed: ${resolved.passedRuns}`,
    `- Failed: ${resolved.failedRuns}`,
    `- Errors: ${resolved.errorRuns}`,
    `- Timeouts: ${resolved.timeoutRuns}`,
    `- Median duration: ${resolved.medianDurationMs}ms`,
    "",
    "## Failure categories",
    "",
    ...Object.entries(resolved.failures).map(
      ([category, count]) => `- ${category}: ${count}`,
    ),
    "",
    ...groupSection,
    "## Tasks",
    "",
    "| Task | Runs | Passed |",
    "| --- | ---: | ---: |",
    ...resolved.byTask.map(
      (task) => `| ${task.taskId} | ${task.runs} | ${task.passed} |`,
    ),
    "",
    "## Runs",
    "",
    ...results
      .filter(
        (result) =>
          !result.artifacts.resultPath
            .replace(/\\/g, "/")
            .includes("/diagnose/"),
      )
      .map(
        (result) =>
          `- ${result.taskId}@${result.taskVersion} · ${result.model.model} · **${result.status}** · ${result.durationMs}ms · ${result.artifacts.resultPath}`,
      ),
    "",
  ].join("\n");
}

/**
 * 先执行可能需要文件系统的分组汇总，再渲染无副作用的 Markdown 报告。
 */
export async function renderReportAsync(
  results: EvaluationResult[],
  options: RenderReportOptions = {},
): Promise<string> {
  const summary = await summarizeResultsWithGroups(results, options);
  return renderReport(results, summary);
}
