/**
 * 评测：拷 fixture → 跑 Agent → diff → Verifier → 写 result。
 * 不依赖 Electron。隔离约定在 evaluationPrompt（含 pnpm --ignore-workspace）。
 * 超时 cancel 和收证有竞态，见 docs/eval/Code-Review-v0-v1.md。
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  AgentRuntime,
  type RuntimeCapability,
  type RuntimeOptions,
} from "@desktop-agent/agent-runtime";
import type {
  EvaluationAttempt,
  EvaluationResult,
  EvaluationTask,
  EvaluationVerification,
} from "@desktop-agent/shared";
import { formatSdkEvent, type ProgressSink } from "./progress.js";
import type { LoadedEvaluationTask } from "./task.js";
import { verifyTask } from "./verifier.js";
import { prepareWorkspace, writeDiff } from "./workspace.js";

/**
 * 一次 Agent 运行从评测执行器返回的可审计结果。
 *
 * 文本仅供报告显示，评测通过与否必须由后续 Verifier 根据工作区状态判定。
 */
export interface AgentExecution {
  text: string;
  trace: unknown[];
  error?: string;
}

/**
 * 可替换的评测 Agent 执行边界。
 *
 * Runner 通过此接口支持真实 Runtime 与测试替身；实现必须尊重传入的隔离工作区和 sessionId。
 */
export interface AgentExecutor {
  execute(
    task: EvaluationTask,
    workspacePath: string,
    sessionId: string,
    onProgress?: ProgressSink,
  ): Promise<AgentExecution>;
  continueExecution?(
    task: EvaluationTask,
    workspacePath: string,
    sessionId: string,
    feedback: string,
    onProgress?: ProgressSink,
  ): Promise<AgentExecution>;
  close?(sessionId: string): Promise<void>;
  cancel?(sessionId: string): Promise<void>;
}

/**
 * 使用 AgentRuntime 在隔离 fixture 中执行评测任务。
 *
 * 关闭环境上下文，避免宿主仓库的 git 状态或配置泄漏进评测提示；每个 session 都拥有独立 Runtime。
 */
export class RuntimeAgentExecutor implements AgentExecutor {
  private readonly sessions = new Map<string, AgentRuntime>();

  /**
   * 保存评测统一的 Runtime 默认项与可选子进程环境。
   *
   * 不在构造时创建 Agent，确保每个任务按自己的 maxTurns 和工作区单独初始化。
   */
  constructor(
    private readonly runtimeOptions: RuntimeOptions,
    private readonly subprocessEnv?: Record<string, string>,
  ) {}

  /**
   * 创建评测会话并执行第一轮任务提示。
   *
   * 重复 sessionId 直接失败，防止重试时覆盖仍在运行的 Runtime 或 trace。
   */
  async execute(
    task: EvaluationTask,
    workspacePath: string,
    sessionId: string,
    onProgress?: ProgressSink,
  ): Promise<AgentExecution> {
    if (this.sessions.has(sessionId))
      throw new Error(`Evaluation session already exists: ${sessionId}`);
    const runtime = new AgentRuntime({
      ...this.runtimeOptions,
      maxTurns: task.limits?.maxTurns ?? this.runtimeOptions.maxTurns,
      includeEnvironmentContext: false,
    });
    this.sessions.set(sessionId, runtime);
    return this.send(
      runtime,
      task,
      workspacePath,
      sessionId,
      buildInitialEvaluationPrompt(task),
      onProgress,
    );
  }

  /**
   * 在同一 Agent 会话中继续执行，并传入上一轮的失败反馈。
   *
   * 继续而非重建可保留工具输出与已完成工作，避免 Agent 每次重试重新探索 fixture。
   */
  async continueExecution(
    task: EvaluationTask,
    workspacePath: string,
    sessionId: string,
    feedback: string,
    onProgress?: ProgressSink,
  ): Promise<AgentExecution> {
    const runtime = this.sessions.get(sessionId);
    if (!runtime) throw new Error(`Evaluation session not found: ${sessionId}`);
    return this.send(
      runtime,
      task,
      workspacePath,
      sessionId,
      feedback,
      onProgress,
    );
  }

  /**
   * 消费 SDK 流并提取最后 assistant 文本、trace 与执行错误。
   *
   * 进度日志写到调用方提供的 sink，最终成功状态仍由 Runner 的 Verifier 阶段决定。
   */
  private async send(
    runtime: AgentRuntime,
    task: EvaluationTask,
    workspacePath: string,
    sessionId: string,
    message: string,
    onProgress?: ProgressSink,
  ): Promise<AgentExecution> {
    const log = onProgress ?? (() => undefined);
    const stream = await runtime.sendMessage(
      sessionId,
      message,
      {
        cwd: workspacePath,
        ...(this.subprocessEnv ? { subprocessEnv: this.subprocessEnv } : {}),
      },
      {
        profile: task.profile,
        capabilities: task.capabilities as RuntimeCapability[],
        ...(task.limits?.maxTurns != null
          ? { maxTurns: task.limits.maxTurns }
          : {}),
      },
    );
    let text = "";
    let executionError: string | undefined;
    for await (const event of stream) {
      const line = formatSdkEvent(event);
      if (line) log(line);
      if (event.type === "assistant") {
        const fragments = (
          Array.isArray(event.message?.content) ? event.message.content : []
        )
          .filter(
            (block): block is { type: "text"; text: string } =>
              !!block &&
              typeof block === "object" &&
              "type" in block &&
              block.type === "text" &&
              "text" in block &&
              typeof block.text === "string",
          )
          .map((block) => block.text);
        if (fragments.length > 0) text = fragments.join("");
      }
      if (
        event.type === "result" &&
        (event.is_error ||
          event.subtype === "error" ||
          event.subtype === "error_during_execution" ||
          event.subtype === "error_max_turns")
      ) {
        executionError =
          event.errors?.join("; ") ||
          `Agent execution failed (${event.subtype}).`;
      }
    }
    return {
      text,
      trace: runtime.getAgent(sessionId)?.getTrace() ?? [],
      ...(executionError ? { error: executionError } : {}),
    };
  }

  /**
   * 关闭并移除一个评测 Runtime。
   *
   * 无会话时静默返回，使 Runner 的 finally 清理可安全重复调用。
   */
  async close(sessionId: string): Promise<void> {
    const runtime = this.sessions.get(sessionId);
    if (!runtime) return;
    this.sessions.delete(sessionId);
    await runtime.close(sessionId);
  }

  /**
   * 中断当前 Agent 后释放 Runtime，用于全局评测超时路径。
   *
   * 清理放在 finally，确保 interrupt 自身失败也不会泄漏 session。
   */
  async cancel(sessionId: string): Promise<void> {
    const runtime = this.sessions.get(sessionId);
    if (!runtime) return;
    try {
      await runtime.getAgent(sessionId)?.interrupt();
    } finally {
      this.sessions.delete(sessionId);
      await runtime.close(sessionId);
    }
  }
}

/**
 * 在隔离工作区内运行完整评测，并写入 diff、trace 与结构化 result 工件。
 *
 * 最终 status 只以 Verifier 为准，不能根据模型声称“完成”或返回文本推断通过。
 */
export async function runTask(
  task: LoadedEvaluationTask,
  options: {
    outputRoot: string;
    executor: AgentExecutor;
    model: { model: string; baseURL?: string };
    onProgress?: ProgressSink;
  },
): Promise<EvaluationResult> {
  const log = options.onProgress ?? (() => undefined);
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const runDirectory = join(options.outputRoot, task.id, runId);
  const workspacePath = join(runDirectory, "workspace");
  const baselinePath = join(runDirectory, "baseline");
  const resultPath = join(runDirectory, "result.json");
  const tracePath = join(runDirectory, "trace.json");
  const diffPath = join(runDirectory, "diff.patch");
  const startedAt = new Date().toISOString();
  const started = performance.now();
  log(
    `[eval] start ${task.id}@${task.version} model=${options.model.model}${options.model.baseURL ? ` baseURL=${options.model.baseURL}` : ""}`,
  );
  const maxAttempts = task.limits?.maxAttempts ?? 5;
  const deadline =
    task.limits?.timeoutMs === undefined
      ? undefined
      : performance.now() + task.limits.timeoutMs;
  log(
    `[eval] limits maxTurns=${task.limits?.maxTurns ?? "default"} maxAttempts=${maxAttempts} timeoutMs=${task.limits?.timeoutMs ?? "none"}`,
  );
  await mkdir(runDirectory, { recursive: true });
  const fixturePath = resolve(dirname(task.definitionPath), task.fixture);
  log(`[eval] prepare workspace → ${workspacePath}`);
  await prepareWorkspace(fixturePath, baselinePath, workspacePath);

  const sessionId = `agent-eval-${task.id}-${randomUUID()}`;
  const attempts: EvaluationAttempt[] = [];
  let latestExecution: AgentExecution | undefined;
  let latestError: string | undefined;
  let latestTimedOut = false;
  try {
    for (let attemptIndex = 1; attemptIndex <= maxAttempts; attemptIndex += 1) {
      const attemptStartedAt = new Date().toISOString();
      const attemptStarted = performance.now();
      let execution: AgentExecution | undefined;
      let error: string | undefined;
      let timedOut = false;
      try {
        log(
          `[eval] attempt ${attemptIndex}/${maxAttempts} ${attemptIndex === 1 ? "agent running…" : "continue with feedback…"}`,
        );
        const feedback =
          attemptIndex === 1
            ? undefined
            : buildAttemptRetryFeedback(
                attemptIndex - 1,
                maxAttempts,
                attempts[attempts.length - 1],
              );
        execution = await withTimeout(
          () =>
            feedback === undefined
              ? options.executor.execute(task, workspacePath, sessionId, log)
              : options.executor.continueExecution
                ? options.executor.continueExecution(
                    task,
                    workspacePath,
                    sessionId,
                    feedback,
                    log,
                  )
                : Promise.reject(
                    new Error(
                      "Agent executor does not support continuing an evaluation session.",
                    ),
                  ),
          remainingTimeoutMs(deadline),
          () => options.executor.cancel?.(sessionId),
        );
        latestExecution = execution;
        error = execution?.error;
      } catch (cause) {
        timedOut = cause instanceof EvaluationTimeoutError;
        error = cause instanceof Error ? cause.message : String(cause);
        log(`[eval] attempt ${attemptIndex}/${maxAttempts} error: ${error}`);
      }

      let verification: EvaluationVerification;
      try {
        log("[eval] write diff + verify");
        const changedFiles = await writeDiff(
          baselinePath,
          workspacePath,
          diffPath,
        );
        verification = await verifyWorkspace(
          task,
          workspacePath,
          baselinePath,
          changedFiles,
        );
      } catch (cause) {
        error ??= cause instanceof Error ? cause.message : String(cause);
        verification = {
          passed: false,
          checks: [
            {
              id: "verifier-error",
              passed: false,
              evidence: error,
              durationMs: 0,
            },
          ],
        };
      }
      for (const check of verification.checks)
        log(
          `[verify] ${check.passed ? "pass" : "FAIL"} ${check.id}${check.evidence ? ` — ${truncateEvidence(check.evidence)}` : ""}`,
        );
      const status: EvaluationAttempt["status"] = timedOut
        ? "timeout"
        : error
          ? "error"
          : verification.passed
            ? "passed"
            : "failed";
      attempts.push({
        index: attemptIndex,
        status,
        startedAt: attemptStartedAt,
        endedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - attemptStarted),
        verifier: verification,
        ...(error ? { error } : {}),
      });
      latestError = error;
      latestTimedOut = timedOut;
      if (status === "passed") break;
      if (attemptIndex >= maxAttempts) break;
      if (!shouldRetryAttempt(status, error)) break;
    }
  } finally {
    await options.executor.close?.(sessionId);
  }

  const finalAttempt = attempts[attempts.length - 1];
  if (!finalAttempt) throw new Error("Evaluation produced no attempts.");
  if (latestExecution)
    await writeFile(
      tracePath,
      `${JSON.stringify(latestExecution.trace, null, 2)}\n`,
      "utf8",
    );
  const endedAt = new Date().toISOString();
  const result: EvaluationResult = {
    schemaVersion: 1,
    runId,
    taskId: task.id,
    taskVersion: task.version,
    status: finalAttempt.status,
    startedAt,
    endedAt,
    durationMs: Math.round(performance.now() - started),
    requestedProfile: task.profile,
    capabilities: [...task.capabilities],
    model: options.model,
    verifier: finalAttempt.verifier,
    artifacts: {
      workspacePath,
      tracePath: latestExecution ? tracePath : undefined,
      diffPath,
      resultPath,
    },
    attemptCount: attempts.length,
    attempts,
    ...(latestError ? { error: latestError } : {}),
    failure: classifyFailure(
      latestTimedOut,
      latestError,
      latestExecution?.trace,
      finalAttempt.verifier.passed,
    ),
  };
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  log(`[eval] ${result.status} in ${result.durationMs}ms → ${resultPath}`);
  return result;
}

/**
 * 压缩单条验证证据以保持 CLI 进度输出可读。
 *
 * 原始证据仍会写入 result.json，截断不影响最终审计信息。
 */
function truncateEvidence(evidence: string): string {
  const flat = evidence.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 159)}…` : flat;
}

/**
 * 运行任务 Verifier，并追加 Runner 负责的变更文件数限制。
 *
 * 追加检查后必须重算 passed，避免 Verifier 本身通过时忽略 Runner 级约束。
 */
async function verifyWorkspace(
  task: LoadedEvaluationTask,
  workspacePath: string,
  baselinePath: string,
  changedFiles: number,
): Promise<EvaluationVerification> {
  const verification = await verifyTask(task, workspacePath, baselinePath);
  if (task.limits?.maxChangedFiles !== undefined) {
    verification.checks.push({
      id: "changed-files-limit",
      passed: changedFiles <= task.limits.maxChangedFiles,
      evidence: `Changed ${changedFiles} files (maximum ${task.limits.maxChangedFiles}).`,
      durationMs: 0,
    });
    verification.passed = verification.checks.every((check) => check.passed);
  }
  return verification;
}

/** 仅对 verifier 失败、超时和 max-turns 执行错误续跑，避免无意义重试。 */
export function shouldRetryAttempt(
  status: EvaluationAttempt["status"],
  error?: string,
): boolean {
  if (status === "failed" || status === "timeout") return true;
  if (status === "error" && error && isMaxTurnsError(error)) return true;
  return false;
}

/** 识别可通过续跑恢复的 max-turns 错误，不把普通执行错误误判为可重试。 */
export function isMaxTurnsError(error: string): boolean {
  return /max_turns|error_max_turns/i.test(error);
}

/** 将上一轮执行/验证失败转换为同 session 的续跑反馈，而不要求 Agent 从头探索。 */
export function buildAttemptRetryFeedback(
  previousAttempt: number,
  maxAttempts: number,
  previous: EvaluationAttempt,
): string {
  const sections = [
    `The previous attempt (${previousAttempt}) did not complete successfully.`,
    `You are continuing attempt ${previousAttempt + 1} of ${maxAttempts}.`,
    "Continue in the current workspace and preserve correct existing work.",
    "Do not restart the task or recreate the project unless required.",
  ];
  if (previous.error) {
    sections.push(
      "",
      "## Execution error",
      formatExecutionError(previous.error),
    );
  }
  if (!previous.verifier.passed) {
    sections.push(
      "",
      "## Failed verification checks",
      formatFailedChecks(previous.verifier),
    );
  }
  sections.push(
    "",
    "Inspect the issues above, make the smallest necessary corrections, and verify the result.",
  );
  return sections.join("\n");
}

/** 将执行错误格式化为续跑提示；max-turns 额外要求 Agent 聚焦剩余缺口。 */
function formatExecutionError(error: string): string {
  const lines = [`- ${error.trim()}`];
  if (isMaxTurnsError(error)) {
    lines.push(
      "- You ran out of turns before finishing. Focus on the remaining gaps instead of re-exploring from scratch.",
    );
  }
  return lines.join("\n");
}

/** 汇总所有失败验证项；没有细项时保留显式通用失败说明。 */
function formatFailedChecks(verification: EvaluationVerification): string {
  const failed = verification.checks.filter((check) => !check.passed);
  if (failed.length === 0)
    return "- Verification failed without detailed check evidence.";
  return failed.map((check) => formatFailedCheck(check)).join("\n\n");
}

/** 将单个失败 check 转为可执行反馈，按检查类型追加修复方向。 */
function formatFailedCheck(
  check: EvaluationVerification["checks"][number],
): string {
  const lines = [`### ${check.id}`, check.evidence.trim()];
  if (check.id.startsWith("command:")) {
    const stderr = extractStderr(check.evidence);
    if (stderr)
      lines.push("", "Harness stderr (fix these first):", "```", stderr, "```");
    lines.push(
      "Re-run the verification command locally if needed and fix the reported issue.",
    );
  } else if (check.id.startsWith("file:")) {
    lines.push(
      "Create or replace this file under the workspace with the content required by the task.",
    );
  } else if (check.id.includes("snapshot") || check.id.includes("unchanged")) {
    lines.push(
      "Compare the current file with the expected protected content and restore or correct only what changed.",
    );
  } else if (check.id === "changed-files-limit") {
    lines.push("Reduce the scope of edits; undo unnecessary file changes.");
  }
  return lines.join("\n");
}

/** 从命令 verifier 的 evidence 中提取尾部 stderr，供重试提示优先展示。 */
function extractStderr(evidence: string): string | undefined {
  const match = evidence.match(/stderr:\s*(.+)$/is);
  return match?.[1]?.trim();
}

/** 构造首轮隔离评测提示，始终把工作区限制放在任务正文之前。 */
function buildInitialEvaluationPrompt(task: EvaluationTask): string {
  return [
    "This is an isolated evaluation workspace. Work only inside the current working directory.",
    ...codingEvalConstraints(task),
    task.prompt,
  ].join("\n\n");
}

/** 计算全局 deadline 剩余毫秒，过期时返回零交给 timeout 路径立即取消。 */
function remainingTimeoutMs(deadline: number | undefined): number | undefined {
  if (deadline === undefined) return undefined;
  return Math.max(0, Math.round(deadline - performance.now()));
}

/** 将超时、Agent、环境和 verifier 失败归类，供结果消费者稳定统计。 */
function classifyFailure(
  timedOut: boolean,
  error: string | undefined,
  trace: unknown[] | undefined,
  verifierPassed: boolean,
): EvaluationResult["failure"] {
  if (timedOut)
    return { category: "timeout", reason: "Evaluation deadline exceeded." };
  if (error) return { category: "agent", reason: error };
  const serializedTrace = JSON.stringify(trace ?? []);
  if (/spawn (EPERM|EACCES|EINVAL|ENOENT)/i.test(serializedTrace)) {
    return {
      category: "environment",
      reason: "A required tool process could not be started.",
    };
  }
  return verifierPassed
    ? undefined
    : {
        category: "verifier",
        reason: "One or more deterministic verification checks failed.",
      };
}

/**
 * 为不同 profile 生成评测约束。
 *
 * coding 默认禁止改 tests/package.json；仅在提示明确依赖升级时放开 package.json，保持 fixture 可复现。
 */
function codingEvalConstraints(task: EvaluationTask): string[] {
  if (task.profile !== "coding") {
    return [
      "Prefer creating outputs under the paths named in the task. Do not modify protected input fixtures.",
    ];
  }
  const mayTouchPackageJson =
    /\bpackage\.json\b/i.test(task.prompt) &&
    /(升级|upgrade|dependenc)/i.test(task.prompt);
  return [
    mayTouchPackageJson
      ? "You may update package.json when the task requires a dependency upgrade. Do not modify tests unless the task explicitly asks."
      : "Do not modify tests or package.json. Inspect the source and tests, make the smallest correct source change, and verify it.",
    "When this fixture uses pnpm, run its scripts as `pnpm --ignore-workspace <script>` so it stays isolated from the host repository.",
  ];
}

/** 表示 runner 全局 deadline，而非 Agent 自身返回的普通执行错误。 */
class EvaluationTimeoutError extends Error {}

/**
 * 为执行包装 deadline。
 *
 * timeout 发生时触发 cancel 但不等待其完成，避免取消阻塞掩盖原始超时；底层 Promise 的拒绝会被预先消费。
 */
async function withTimeout<T>(
  run: () => Promise<T>,
  timeoutMs: number | undefined,
  cancel: () => Promise<void> | undefined,
): Promise<T> {
  if (timeoutMs === undefined) return run();
  if (timeoutMs <= 0) {
    await cancel();
    throw new EvaluationTimeoutError("Evaluation deadline exceeded.");
  }
  const execution = run();
  void execution.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      execution,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new EvaluationTimeoutError(
                `Evaluation timed out after ${timeoutMs}ms.`,
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } catch (error) {
    if (error instanceof EvaluationTimeoutError) await cancel();
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
