import type {
  CreateMessageParams,
  CreateMessageResponse,
  LLMProvider,
  NormalizedContentBlock,
  NormalizedMessageParam,
  NormalizedResponseBlock,
  NormalizedTool,
} from '@codeany/open-agent-sdk';

type TextDeltaHandler = (delta: string) => void;

interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

export class StreamingOpenAIProvider implements LLMProvider {
  readonly apiType = 'openai-completions' as const;
  private apiKey: string;
  private baseURL: string;
  private onTextDelta?: TextDeltaHandler;

  constructor(opts: { apiKey?: string; baseURL?: string; onTextDelta?: TextDeltaHandler }) {
    this.apiKey = opts.apiKey || '';
    this.baseURL = (opts.baseURL || 'https://api.openai.com/v1').replace(/\/$/, '');
    this.onTextDelta = opts.onTextDelta;
  }

  setOnTextDelta(handler?: TextDeltaHandler): void {
    this.onTextDelta = handler;
  }

  async createMessage(params: CreateMessageParams): Promise<CreateMessageResponse> {
    const messages = this.convertMessages(params.system, params.messages);
    const tools = params.tools ? this.convertTools(params.tools) : undefined;

    const body: Record<string, unknown> = {
      model: params.model,
      max_tokens: params.maxTokens,
      messages,
      stream: true,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      const err = new Error(`OpenAI API error: ${response.status} ${response.statusText}: ${errBody}`) as Error & {
        status?: number;
      };
      err.status = response.status;
      throw err;
    }

    if (!response.body) {
      throw new Error('Response body is empty');
    }

    let textContent = '';
    const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();
    let finishReason = 'stop';
    let usage = { input_tokens: 0, output_tokens: 0 };

    for await (const chunk of this.parseSSE(response.body)) {
      if (chunk.usage) {
        usage = {
          input_tokens: chunk.usage.prompt_tokens || 0,
          output_tokens: chunk.usage.completion_tokens || 0,
        };
      }

      const choice = chunk.choices?.[0];
      if (!choice) continue;

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }

      const deltaContent = choice.delta?.content;
      if (deltaContent) {
        textContent += deltaContent;
        this.onTextDelta?.(deltaContent);
      }

      const deltaToolCalls = choice.delta?.tool_calls;
      if (deltaToolCalls) {
        for (const toolCall of deltaToolCalls) {
          const current = toolCalls.get(toolCall.index) || {
            id: toolCall.id || '',
            name: toolCall.function?.name || '',
            arguments: '',
          };
          if (toolCall.id) current.id = toolCall.id;
          if (toolCall.function?.name) current.name = toolCall.function.name;
          if (toolCall.function?.arguments) current.arguments += toolCall.function.arguments;
          toolCalls.set(toolCall.index, current);
        }
      }
    }

    const content: NormalizedResponseBlock[] = [];
    if (textContent) {
      content.push({ type: 'text', text: textContent });
    }

    for (const toolCall of toolCalls.values()) {
      let input: unknown;
      try {
        input = JSON.parse(toolCall.arguments);
      } catch {
        input = toolCall.arguments;
      }
      content.push({
        type: 'tool_use',
        id: toolCall.id,
        name: toolCall.name,
        input,
      });
    }

    if (content.length === 0) {
      content.push({ type: 'text', text: '' });
    }

    return {
      content,
      stopReason: this.mapFinishReason(finishReason),
      usage,
    };
  }

  private async *parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<OpenAIStreamChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') continue;

        try {
          yield JSON.parse(data) as OpenAIStreamChunk;
        } catch {
          // ignore malformed chunks
        }
      }
    }
  }

  private convertMessages(system: string, messages: NormalizedMessageParam[]): OpenAIChatMessage[] {
    const result: OpenAIChatMessage[] = [];
    if (system) {
      result.push({ role: 'system', content: system });
    }

    for (const msg of messages) {
      if (msg.role === 'user') {
        this.convertUserMessage(msg, result);
      } else if (msg.role === 'assistant') {
        this.convertAssistantMessage(msg, result);
      }
    }

    return result;
  }

  private convertUserMessage(msg: NormalizedMessageParam, result: OpenAIChatMessage[]): void {
    if (typeof msg.content === 'string') {
      result.push({ role: 'user', content: msg.content });
      return;
    }

    const textParts: string[] = [];
    const toolResults: Array<{ tool_use_id: string; content: string }> = [];

    for (const block of msg.content) {
      if (block.type === 'text') {
        textParts.push(block.text);
      } else if (block.type === 'tool_result') {
        toolResults.push({
          tool_use_id: block.tool_use_id,
          content: block.content,
        });
      }
    }

    for (const tr of toolResults) {
      result.push({
        role: 'tool',
        tool_call_id: tr.tool_use_id,
        content: tr.content,
      });
    }

    if (textParts.length > 0) {
      result.push({ role: 'user', content: textParts.join('\n') });
    }
  }

  private convertAssistantMessage(msg: NormalizedMessageParam, result: OpenAIChatMessage[]): void {
    if (typeof msg.content === 'string') {
      result.push({ role: 'assistant', content: msg.content });
      return;
    }

    const textParts: string[] = [];
    const toolCalls: OpenAIChatMessage['tool_calls'] = [];

    for (const block of msg.content) {
      if (block.type === 'text') {
        textParts.push(block.text);
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: typeof block.input === 'string' ? block.input : JSON.stringify(block.input),
          },
        });
      }
    }

    const assistantMsg: OpenAIChatMessage = {
      role: 'assistant',
      content: textParts.length > 0 ? textParts.join('\n') : null,
    };

    if (toolCalls.length > 0) {
      assistantMsg.tool_calls = toolCalls;
    }

    result.push(assistantMsg);
  }

  private convertTools(tools: NormalizedTool[]) {
    return tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
  }

  private mapFinishReason(reason: string): 'end_turn' | 'max_tokens' | 'tool_use' | string {
    switch (reason) {
      case 'stop':
        return 'end_turn';
      case 'length':
        return 'max_tokens';
      case 'tool_calls':
        return 'tool_use';
      default:
        return reason;
    }
  }
}
