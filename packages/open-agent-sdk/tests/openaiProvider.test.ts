import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAIProvider } from '../src/providers/openai';

interface CapturedOpenAIRequest {
  messages: Array<{
    role: string;
    content: unknown;
  }>;
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
});
