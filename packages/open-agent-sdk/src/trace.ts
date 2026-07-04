/**
 * Agent Trace — observability for the agent loop
 *
 * Records each turn's LLM request/response and tool executions as spans.
 * Persists to trace.jsonl alongside session transcripts for replay.
 */

import { appendFile, readFile, mkdir } from 'fs/promises'
import { join } from 'path'
import type { TokenUsage } from './types.js'
import type { NormalizedMessageParam, NormalizedTool } from './providers/types.js'

// --------------------------------------------------------------------------
// Trace Types
// --------------------------------------------------------------------------

export type TraceSpanType =
  | 'run_start'
  | 'run_end'
  | 'turn_start'
  | 'llm_request'
  | 'llm_response'
  | 'tool_call'
  | 'tool_result'
  | 'compact'

export interface TraceSpan {
  id: string
  parentId?: string
  runId: string
  sessionId: string
  turn?: number
  type: TraceSpanType
  timestamp: string
  durationMs?: number
  payload?: TraceSpanPayload
}

export interface LlmRequestPayload {
  model: string
  system: string
  messages: NormalizedMessageParam[]
  tools?: NormalizedTool[]
  maxTokens?: number
  thinking?: { type: string; budget_tokens?: number }
  estimatedInputTokens?: number
}

export interface LlmResponsePayload {
  content: unknown[]
  stopReason?: string | null
  usage?: TokenUsage
}

export interface ToolCallPayload {
  toolUseId: string
  name: string
  input: unknown
}

export interface ToolResultPayload {
  toolUseId: string
  name: string
  output: string
  isError: boolean
  truncated?: boolean
}

export interface RunStartPayload {
  prompt: unknown
  model: string
  cwd: string
  toolNames: string[]
}

export interface RunEndPayload {
  numTurns: number
  totalCostUsd?: number
  usage?: TokenUsage
  subtype: string
  isError?: boolean
}

export interface CompactPayload {
  reason: 'auto' | 'prompt_too_long'
  messageCountBefore: number
}

export type TraceSpanPayload =
  | LlmRequestPayload
  | LlmResponsePayload
  | ToolCallPayload
  | ToolResultPayload
  | RunStartPayload
  | RunEndPayload
  | CompactPayload
  | Record<string, unknown>

export interface TraceConfig {
  /** Enable trace recording. Default true when trace option is set. */
  enabled?: boolean
  /** Persist spans to trace.jsonl. Default true. */
  persist?: boolean
  /** Truncate large tool outputs in trace. Default 10000 chars. 0 = no limit. */
  maxToolOutputChars?: number
  /** Real-time callback for each recorded span. */
  onSpan?: (span: TraceSpan) => void
}

export interface TraceTurn {
  turn: number
  startedAt: string
  durationMs?: number
  llmRequest?: TraceSpan
  llmResponse?: TraceSpan
  toolCalls: Array<{
    call: TraceSpan
    result?: TraceSpan
  }>
}

export interface TraceRun {
  runId: string
  sessionId: string
  startedAt: string
  endedAt?: string
  durationMs?: number
  turns: TraceTurn[]
  startSpan?: TraceSpan
  endSpan?: TraceSpan
}

// --------------------------------------------------------------------------
// Trace file paths
// --------------------------------------------------------------------------

function getSessionsDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp'
  return join(home, '.open-agent-sdk', 'sessions')
}

function getTracePath(sessionId: string): string {
  return join(getSessionsDir(), sessionId, 'trace.jsonl')
}

function getSessionDir(sessionId: string): string {
  return join(getSessionsDir(), sessionId)
}

// --------------------------------------------------------------------------
// TraceRecorder
// --------------------------------------------------------------------------

export class TraceRecorder {
  private enabled: boolean
  private persist: boolean
  private sessionId: string
  private maxToolOutputChars: number
  private onSpan?: (span: TraceSpan) => void
  private spans: TraceSpan[] = []
  private currentRunId: string | null = null
  private runStartTime = 0
  private turnSpanIds = new Map<number, string>()
  private llmRequestSpanIds = new Map<number, string>()
  private toolCallSpanIds = new Map<string, string>()

  constructor(sessionId: string, config: TraceConfig | boolean = true) {
    const cfg: TraceConfig =
      typeof config === 'boolean' ? { enabled: config } : config

    this.sessionId = sessionId
    this.enabled = cfg.enabled !== false
    this.persist = cfg.persist !== false
    this.maxToolOutputChars = cfg.maxToolOutputChars ?? 10_000
    this.onSpan = cfg.onSpan
  }

  isEnabled(): boolean {
    return this.enabled
  }

  getSessionId(): string {
    return this.sessionId
  }

  getCurrentRunId(): string | null {
    return this.currentRunId
  }

  getSpans(): TraceSpan[] {
    return [...this.spans]
  }

  getSpansForRun(runId: string): TraceSpan[] {
    return this.spans.filter((s) => s.runId === runId)
  }

  /** Load previously persisted spans (e.g. on session resume). */
  loadSpans(spans: TraceSpan[]): void {
    this.spans = [...spans]
  }

  startRun(payload: RunStartPayload): string {
    if (!this.enabled) return ''

    const runId = crypto.randomUUID()
    this.currentRunId = runId
    this.runStartTime = performance.now()
    this.turnSpanIds.clear()
    this.llmRequestSpanIds.clear()
    this.toolCallSpanIds.clear()

    this.record({
      runId,
      type: 'run_start',
      payload,
    })

    return runId
  }

  endRun(payload: RunEndPayload): void {
    if (!this.enabled || !this.currentRunId) return

    const durationMs = Math.round(performance.now() - this.runStartTime)
    this.record({
      runId: this.currentRunId,
      type: 'run_end',
      durationMs,
      payload,
    })

    this.currentRunId = null
  }

  recordTurnStart(turn: number): TraceSpan | null {
    if (!this.enabled || !this.currentRunId) return null

    const span = this.record({
      runId: this.currentRunId,
      turn,
      type: 'turn_start',
      parentId: this.getRunStartSpanId(),
    })
    this.turnSpanIds.set(turn, span.id)
    return span
  }

  recordLlmRequest(turn: number, payload: LlmRequestPayload): TraceSpan | null {
    if (!this.enabled || !this.currentRunId) return null

    const span = this.record({
      runId: this.currentRunId,
      turn,
      type: 'llm_request',
      parentId: this.turnSpanIds.get(turn),
      payload,
    })
    this.llmRequestSpanIds.set(turn, span.id)
    return span
  }

  recordLlmResponse(
    turn: number,
    payload: LlmResponsePayload,
    durationMs: number,
  ): TraceSpan | null {
    if (!this.enabled || !this.currentRunId) return null

    return this.record({
      runId: this.currentRunId,
      turn,
      type: 'llm_response',
      parentId: this.llmRequestSpanIds.get(turn),
      durationMs,
      payload,
    })
  }

  recordToolCall(turn: number, payload: ToolCallPayload): TraceSpan | null {
    if (!this.enabled || !this.currentRunId) return null

    const span = this.record({
      runId: this.currentRunId,
      turn,
      type: 'tool_call',
      parentId: this.turnSpanIds.get(turn),
      payload,
    })
    this.toolCallSpanIds.set(payload.toolUseId, span.id)
    return span
  }

  recordToolResult(
    turn: number,
    payload: ToolResultPayload,
    durationMs: number,
  ): TraceSpan | null {
    if (!this.enabled || !this.currentRunId) return null

    const output = this.truncateOutput(payload.output)
    const truncated = output !== payload.output

    return this.record({
      runId: this.currentRunId,
      turn,
      type: 'tool_result',
      parentId: this.toolCallSpanIds.get(payload.toolUseId),
      durationMs,
      payload: { ...payload, output, truncated },
    })
  }

  recordCompact(payload: CompactPayload): TraceSpan | null {
    if (!this.enabled || !this.currentRunId) return null

    return this.record({
      runId: this.currentRunId,
      type: 'compact',
      parentId: this.getRunStartSpanId(),
      payload,
    })
  }

  private getRunStartSpanId(): string | undefined {
    if (!this.currentRunId) return undefined
    return this.spans.find(
      (s) => s.runId === this.currentRunId && s.type === 'run_start',
    )?.id
  }

  private truncateOutput(output: string): string {
    if (this.maxToolOutputChars <= 0 || output.length <= this.maxToolOutputChars) {
      return output
    }
    return (
      output.slice(0, this.maxToolOutputChars) +
      `\n... [truncated, ${output.length - this.maxToolOutputChars} chars omitted]`
    )
  }

  private record(
    partial: Omit<TraceSpan, 'id' | 'sessionId' | 'timestamp'>,
  ): TraceSpan {
    const span: TraceSpan = {
      id: crypto.randomUUID(),
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      ...partial,
    }

    this.spans.push(span)
    this.onSpan?.(span)

    if (this.persist) {
      appendTraceSpan(this.sessionId, span).catch(() => {})
    }

    return span
  }
}

// --------------------------------------------------------------------------
// Persistence (trace.jsonl)
// --------------------------------------------------------------------------

/** Append a single span to trace.jsonl. */
export async function appendTraceSpan(
  sessionId: string,
  span: TraceSpan,
): Promise<void> {
  const dir = getSessionDir(sessionId)
  await mkdir(dir, { recursive: true })
  await appendFile(getTracePath(sessionId), JSON.stringify(span) + '\n', 'utf-8')
}

/** Load all trace spans for a session from trace.jsonl. */
export async function loadSessionTrace(sessionId: string): Promise<TraceSpan[]> {
  try {
    const content = await readFile(getTracePath(sessionId), 'utf-8')
    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as TraceSpan)
  } catch {
    return []
  }
}

/** Load trace spans for a specific run within a session. */
export async function loadSessionTraceByRun(
  sessionId: string,
  runId: string,
): Promise<TraceSpan[]> {
  const spans = await loadSessionTrace(sessionId)
  return spans.filter((s) => s.runId === runId)
}

// --------------------------------------------------------------------------
// Replay helpers
// --------------------------------------------------------------------------

/** Group flat spans into structured runs for replay/analysis. */
export function groupTraceByRun(spans: TraceSpan[]): TraceRun[] {
  const runIds = [...new Set(spans.map((s) => s.runId))]
  return runIds.map((runId) => buildTraceRun(spans.filter((s) => s.runId === runId)))
}

/** Group spans from a single run into turns. */
export function groupTraceByTurn(spans: TraceSpan[]): TraceTurn[] {
  const runSpans = spans
  const turnNumbers = [
    ...new Set(runSpans.filter((s) => s.turn != null).map((s) => s.turn!)),
  ].sort((a, b) => a - b)

  return turnNumbers.map((turn) => {
    const turnSpans = runSpans.filter((s) => s.turn === turn)
    const llmRequest = turnSpans.find((s) => s.type === 'llm_request')
    const llmResponse = turnSpans.find((s) => s.type === 'llm_response')
    const toolCallSpans = turnSpans.filter((s) => s.type === 'tool_call')
    const toolResultSpans = turnSpans.filter((s) => s.type === 'tool_result')

    const toolCalls = toolCallSpans.map((call) => {
      const toolUseId = (call.payload as ToolCallPayload)?.toolUseId
      const result = toolResultSpans.find(
        (r) => (r.payload as ToolResultPayload)?.toolUseId === toolUseId,
      )
      return { call, result }
    })

    const turnStart = turnSpans.find((s) => s.type === 'turn_start')
    const durationMs = sumDuration([llmResponse, ...toolResultSpans])

    return {
      turn,
      startedAt: turnStart?.timestamp ?? llmRequest?.timestamp ?? '',
      durationMs,
      llmRequest,
      llmResponse,
      toolCalls,
    }
  })
}

/** Replay a session's trace — returns all runs with turns grouped. */
export async function replaySessionTrace(sessionId: string): Promise<TraceRun[]> {
  const spans = await loadSessionTrace(sessionId)
  return groupTraceByRun(spans)
}

/** Replay a single run from a session. */
export async function replayRunTrace(
  sessionId: string,
  runId: string,
): Promise<TraceRun | null> {
  const spans = await loadSessionTraceByRun(sessionId, runId)
  if (spans.length === 0) return null
  return buildTraceRun(spans)
}

function buildTraceRun(spans: TraceSpan[]): TraceRun {
  const runId = spans[0]?.runId ?? ''
  const sessionId = spans[0]?.sessionId ?? ''
  const startSpan = spans.find((s) => s.type === 'run_start')
  const endSpan = spans.find((s) => s.type === 'run_end')

  let durationMs: number | undefined
  if (startSpan && endSpan) {
    durationMs =
      endSpan.durationMs ??
      new Date(endSpan.timestamp).getTime() - new Date(startSpan.timestamp).getTime()
  }

  return {
    runId,
    sessionId,
    startedAt: startSpan?.timestamp ?? spans[0]?.timestamp ?? '',
    endedAt: endSpan?.timestamp,
    durationMs,
    startSpan,
    endSpan,
    turns: groupTraceByTurn(spans),
  }
}

function sumDuration(spans: (TraceSpan | undefined)[]): number | undefined {
  const total = spans.reduce((acc, s) => acc + (s?.durationMs ?? 0), 0)
  return total > 0 ? total : undefined
}

/** Resolve trace config from AgentOptions.trace field. */
export function resolveTraceConfig(
  trace: boolean | TraceConfig | undefined,
): TraceConfig | null {
  if (trace === undefined || trace === false) return null
  if (trace === true) return { enabled: true }
  return trace
}
