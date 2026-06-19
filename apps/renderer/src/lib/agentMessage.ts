export function extractStreamText(message: unknown, currentContent = ''): string | null {
  if (!message || typeof message !== 'object') return null;

  const record = message as Record<string, unknown>;

  if (record.type === 'partial_message') {
    const partial = record.partial as { type?: string; text?: string } | undefined;
    if (partial?.type === 'text' && partial.text) {
      return currentContent + partial.text;
    }
  }

  if (record.type === 'assistant') {
    const msg = record.message as { content?: unknown } | undefined;
    const parsed = parseMessageContent(msg?.content);
    if (parsed) return parsed;
  }

  return null;
}

export function parseMessageContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((block): block is { text: string } => block != null && typeof block === 'object' && 'text' in block)
      .map((block) => block.text)
      .join('');
  }
  return '';
}

const RESULT_ERROR_HINT: Record<string, string> = {
  error: 'API 请求失败，请检查模型名称、API Key 和 Base URL 是否正确',
  error_during_execution: 'Agent 执行过程中出错',
  error_max_turns: '已达到最大对话轮数',
  error_max_budget_usd: '已达到费用上限',
};

export function analyzeAgentMessages(messages: unknown[]): { text: string; error?: string } {
  let text = '';
  let error: string | undefined;

  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue;

    const record = msg as Record<string, unknown>;

    if (record.type === 'assistant') {
      const message = record.message as { content?: unknown } | undefined;
      const parsed = parseMessageContent(message?.content);
      if (parsed) text = parsed;
    }

    if (record.type === 'result') {
      const subtype = typeof record.subtype === 'string' ? record.subtype : '';
      const errors = Array.isArray(record.errors)
        ? record.errors.filter((item): item is string => typeof item === 'string')
        : [];

      if (errors.length > 0) {
        error = errors.join('；');
      } else if (subtype === 'error' || record.is_error === true) {
        error = RESULT_ERROR_HINT[subtype] || `请求失败（${subtype || 'unknown'}）`;
      }

      if (typeof record.result === 'string' && record.result) {
        text = record.result;
      }
    }
  }

  return { text, error };
}

export function extractAssistantText(messages: unknown[]): string {
  return analyzeAgentMessages(messages).text;
}
