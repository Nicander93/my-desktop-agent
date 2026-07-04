/**
 * Example: Agent Trace / Observability
 *
 * Demonstrates trace recording, streaming trace events, persistence, and replay.
 *
 * Run: npx tsx examples/15-trace.ts
 */

import {
  createAgent,
  replaySessionTrace,
  type TraceSpan,
} from '../src/index.js'

async function main() {
  const agent = createAgent({
    model: process.env.CODEANY_MODEL || 'claude-sonnet-4-6',
    maxTurns: 5,
    trace: {
      enabled: true,
      persist: true,
      onSpan: (span) => {
        // Real-time callback — useful for pushing to UI
        if (span.type === 'llm_request') {
          const p = span.payload as { model?: string; estimatedInputTokens?: number }
          console.log(`  [trace] Turn ${span.turn} LLM request → ${p.model} (~${p.estimatedInputTokens} tokens)`)
        } else if (span.type === 'tool_call') {
          const p = span.payload as { name?: string }
          console.log(`  [trace] Turn ${span.turn} tool → ${p.name}`)
        }
      },
    },
    allowedTools: ['Glob', 'Read'],
    permissionMode: 'bypassPermissions',
    sessionId: `trace-demo-${Date.now()}`,
  })

  console.log('=== Running query with trace enabled ===\n')

  const traceEvents: TraceSpan[] = []

  for await (const ev of agent.query('List the top-level files in this project (use Glob).')) {
    if (ev.type === 'trace') {
      traceEvents.push(ev.span)
    } else if (ev.type === 'assistant') {
      for (const block of ev.message.content) {
        if (block.type === 'text') console.log('\nAssistant:', block.text.slice(0, 200))
      }
    } else if (ev.type === 'result') {
      console.log(`\nDone: ${ev.num_turns} turns, $${ev.total_cost_usd?.toFixed(4) ?? '?'}`)
    }
  }

  console.log(`\n=== In-memory trace: ${agent.getTrace().length} spans ===`)

  // Replay grouped by runs and turns
  const runs = await agent.replayTrace()
  for (const run of runs) {
    console.log(`\nRun ${run.runId.slice(0, 8)}… (${run.turns.length} turns, ${run.durationMs}ms)`)
    for (const turn of run.turns) {
      const tools = turn.toolCalls.map((t) => (t.call.payload as { name?: string }).name).join(', ')
      const usage = turn.llmResponse?.payload as { usage?: { input_tokens?: number; output_tokens?: number } }
      console.log(
        `  Turn ${turn.turn}: ${turn.durationMs ?? '?'}ms` +
          (usage?.usage ? ` | ${usage.usage.input_tokens} in / ${usage.usage.output_tokens} out` : '') +
          (tools ? ` | tools: ${tools}` : ''),
      )
    }
  }

  // Load from disk (trace.jsonl)
  const sessionId = agent.getSessionId()
  const fromDisk = await replaySessionTrace(sessionId)
  console.log(`\n=== Loaded from trace.jsonl: ${fromDisk.length} run(s) ===`)

  await agent.close()
}

main().catch(console.error)
