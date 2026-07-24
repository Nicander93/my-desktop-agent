import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db', () => ({ getDatabase: vi.fn(), saveDatabase: vi.fn() }));

import { testModelConnection } from '../src/services/modelConfigService';

describe('modelConfigService connection test', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('tests a keyless local OpenAI-compatible endpoint without authorization', async () => {
    let url = '';
    let headers: Headers | undefined;
    vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
      url = input;
      headers = new Headers(init?.headers);
      return new Response(JSON.stringify({ data: [{ id: 'qwen2.5-coder:7b' }, { id: 'qwen3:8b' }] }), { status: 200 });
    });

    const result = await testModelConnection({ baseURL: 'http://127.0.0.1:11434/v1/', apiKey: null });

    expect(url).toBe('http://127.0.0.1:11434/v1/models');
    expect(headers?.has('Authorization')).toBe(false);
    expect(result).toEqual({ success: true, models: ['qwen2.5-coder:7b', 'qwen3:8b'] });
  });

  it('returns endpoint errors without attempting a generation request', async () => {
    vi.stubGlobal('fetch', async () => new Response('unavailable', { status: 503, statusText: 'Service Unavailable' }));

    await expect(testModelConnection({ baseURL: 'http://localhost:1234/v1', apiKey: 'secret' })).resolves.toEqual({
      success: false,
      error: '模型服务返回 503 Service Unavailable',
    });
  });
});
