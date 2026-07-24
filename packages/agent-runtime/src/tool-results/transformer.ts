import type { ToolResultTransformer } from '@codeany/open-agent-sdk';

export function createToolResultTransformer(maxChars: number, profile?: string): ToolResultTransformer {
  return (result, _context) => {
    const raw = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    if (raw.length <= maxChars) return result;
    const head = raw.slice(0, Math.ceil(maxChars * 0.6));
    const tail = raw.slice(-Math.floor(maxChars * 0.4));
    return { ...result, content: `${head}\n\n[tool result summarized; raw result available in trace; profile=${profile ?? 'general'}]\n\n${tail}` };
  };
}
