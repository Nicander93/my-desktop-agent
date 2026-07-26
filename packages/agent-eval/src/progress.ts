/**
 * 评测过程输出：默认打 stderr，stdout 留给最终 result JSON。
 */
import type { SDKMessage } from '@desktop-agent/agent-runtime';

export type ProgressSink = (line: string) => void;

export function createProgressSink(quiet: boolean): ProgressSink {
  if (quiet) return () => undefined;
  return (line) => {
    console.error(line);
  };
}

export function formatSdkEvent(event: SDKMessage): string | null {
  switch (event.type) {
    case 'system':
      return event.subtype === 'init'
        ? `[agent] init model=${event.model} tools=${event.tools.length}`
        : null;
    case 'assistant': {
      const blocks = Array.isArray(event.message?.content) ? event.message.content : [];
      const texts: string[] = [];
      const tools: string[] = [];
      for (const block of blocks) {
        if (!block || typeof block !== 'object') continue;
        if ('type' in block && block.type === 'text' && 'text' in block && typeof block.text === 'string') {
          texts.push(block.text);
        }
        if ('type' in block && block.type === 'tool_use' && 'name' in block) {
          const name = String(block.name);
          const input = 'input' in block ? summarizeToolInput(name, block.input) : '';
          tools.push(input ? `${name}(${input})` : name);
        }
      }
      const parts = [
        texts.length > 0 ? truncate(texts.join('').trim(), 240) : '',
        tools.length > 0 ? `tools: ${tools.join(', ')}` : '',
      ].filter(Boolean);
      return parts.length > 0 ? `[agent] ${parts.join(' | ')}` : null;
    }
    case 'tool_result': {
      const name = event.result.tool_name;
      const output = truncate(String(event.result.output ?? '').replace(/\s+/g, ' ').trim(), 180);
      return `[tool] ${name} → ${output || '(empty)'}`;
    }
    case 'result': {
      const turns = event.num_turns != null ? ` turns=${event.num_turns}` : '';
      const ms = event.duration_ms != null ? ` ${event.duration_ms}ms` : '';
      return `[agent] done subtype=${event.subtype}${turns}${ms}`;
    }
    default:
      return null;
  }
}

function summarizeToolInput(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const record = input as Record<string, unknown>;
  if (name === 'Bash' && typeof record.command === 'string') return truncate(record.command, 120);
  if (typeof record.file_path === 'string') return truncate(record.file_path, 120);
  if (typeof record.path === 'string') return truncate(record.path, 120);
  if (typeof record.pattern === 'string') return truncate(record.pattern, 80);
  return '';
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}
