import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAIProvider } from '../src/providers/openai';

interface CapturedOpenAIRequest {
  messages: Array<{
    role: string;
    content: unknown;
  }>;
  prompt_cache_key?: string;
  prompt_cache_retention?: string;
}

describe('OpenAIProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converts image content blocks to OpenAI image_url parts', async () => {
    let requestBody: CapturedOpenAIRequest | undefined;
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as CapturedOpenAIRequest;
      return new Response(JSON.stringify({
        id: 'chatcmpl-test',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'ok' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }), { status: 200 });
    });

    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    await provider.createMessage({
      model: 'gpt-4o',
      maxTokens: 128,
      system: '',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'describe this' },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: 'abc123',
            },
          },
        ],
      }],
    });

    expect(requestBody?.messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'describe this' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
      ],
    });
  });

  it('sends prompt cache hints and maps cached token usage for OpenAI', async () => {
    let requestBody: CapturedOpenAIRequest | undefined;
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as CapturedOpenAIRequest;
      return new Response(JSON.stringify({
        id: 'chatcmpl-test',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'ok' },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 10,
          total_tokens: 110,
          prompt_tokens_details: { cached_tokens: 80 },
        },
      }), { status: 200 });
    });

    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    const result = await provider.createMessage({
      model: 'gpt-4o',
      maxTokens: 128,
      system: 'stable system',
      messages: [{ role: 'user', content: 'hello' }],
      promptCache: {
        enabled: true,
        key: 'agent:gpt-4o:tools:abc:system:def',
        retention: '24h',
      },
    });

    expect(requestBody?.prompt_cache_key).toBe('agent:gpt-4o:tools:abc:system:def');
    expect(requestBody?.prompt_cache_retention).toBe('24h');
    expect(result.usage.cached_input_tokens).toBe(80);
  });

  it('normalizes a known textual JSON tool call from a compatible server', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      id: 'chatcmpl-local',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: '{"name":"Read","arguments":{"file_path":"README.md"}}' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }), { status: 200 }));

    const provider = new OpenAIProvider({ apiKey: 'ollama', baseURL: 'http://localhost:11434/v1' });
    const result = await provider.createMessage({
      model: 'qwen2.5-coder:7b',
      maxTokens: 128,
      system: '',
      messages: [{ role: 'user', content: 'Read the README' }],
      tools: [{ name: 'Read', description: 'Read a file', input_schema: { type: 'object' } }],
    });

    expect(result.stopReason).toBe('tool_use');
    expect(result.content[0]).toMatchObject({
      type: 'tool_use',
      name: 'Read',
      input: { file_path: 'README.md' },
    });
  });

  it('executes only the first known call when a local model emits multiple fenced calls', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      id: 'chatcmpl-local',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: '```json\n{"name":"Write","arguments":{"file_path":"a.js","content":"ok"}}\n```\n\n```json\n{"name":"Bash","arguments":{"command":"node a.js"}}\n```',
        },
        finish_reason: 'stop',
      }],
    }), { status: 200 }));

    const provider = new OpenAIProvider({ apiKey: 'ollama', baseURL: 'http://localhost:11434/v1' });
    const result = await provider.createMessage({
      model: 'qwen2.5-coder:7b',
      maxTokens: 128,
      system: '',
      messages: [{ role: 'user', content: 'write then run' }],
      tools: [
        { name: 'Write', description: 'Write', input_schema: { type: 'object' } },
        { name: 'Bash', description: 'Run', input_schema: { type: 'object' } },
      ],
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({ type: 'tool_use', name: 'Write' });
  });
});
