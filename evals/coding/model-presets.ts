import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RuntimeOptions } from '@desktop-agent/agent-runtime';
import type { EvalSuite } from './task-schema.js';

export interface EvalModelPreset {
  id: string;
  provider: string;
  apiType: NonNullable<RuntimeOptions['apiType']>;
  apiKeyEnv: string;
  model: string;
  baseURL?: string;
  suites: EvalSuite[];
  runtimeDefaults?: Pick<RuntimeOptions, 'maxTurns' | 'thinking' | 'promptCache'>;
}

/**
 * Match the desktop application's configuration convention without importing
 * Electron code. Existing shell values always win, so CI can inject secrets.
 */
const projectEnv = loadProjectEnv();

function loadProjectEnv(): Record<string, string> {
  const values: Record<string, string> = {};
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(moduleDirectory, '..', '..', '.env');
  if (!existsSync(envPath)) return values;

  for (const sourceLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith('#')) continue;
    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separator = withoutExport.indexOf('=');
    if (separator <= 0) continue;
    const key = withoutExport.slice(0, separator).trim();
    let value = withoutExport.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function readEnv(key: string): string | undefined {
  return process.env[key] ?? projectEnv[key];
}

/**
 * Presets deliberately contain no secrets. `environment` mirrors the SDK's
 * CODEANY_* variables; other presets are convenience defaults for local and
 * OpenRouter experiments and can be overridden with their documented env vars.
 */
export const EVAL_MODEL_PRESETS: Record<string, EvalModelPreset> = {
  environment: {
    id: 'environment',
    provider: 'environment',
    apiType: (readEnv('CODEANY_API_TYPE') as RuntimeOptions['apiType']) ?? 'openai-completions',
    apiKeyEnv: 'CODEANY_API_KEY',
    model: readEnv('CODEANY_MODEL') ?? 'deepseek-v4-flash',
    baseURL: readEnv('CODEANY_BASE_URL'),
    suites: ['smoke', 'regression', 'quality'],
    runtimeDefaults: { maxTurns: 30, thinking: { type: 'disabled' } },
  },
  'ollama-local': {
    id: 'ollama-local',
    provider: 'ollama',
    apiType: 'openai-completions',
    apiKeyEnv: 'OLLAMA_API_KEY',
    model: readEnv('OLLAMA_MODEL') ?? 'qwen2.5-coder:7b',
    baseURL: readEnv('OLLAMA_BASE_URL') ?? 'http://localhost:11434/v1',
    suites: ['smoke'],
    runtimeDefaults: { maxTurns: 20, thinking: { type: 'disabled' } },
  },
  'openrouter-cheap': {
    id: 'openrouter-cheap',
    provider: 'openrouter',
    apiType: 'openai-completions',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    model: readEnv('OPENROUTER_CHEAP_MODEL') ?? '',
    baseURL: readEnv('OPENROUTER_BASE_URL') ?? 'https://openrouter.ai/api/v1',
    suites: ['smoke', 'regression'],
    runtimeDefaults: { maxTurns: 30, thinking: { type: 'disabled' } },
  },
};

export function getModelPreset(id: string): EvalModelPreset {
  const preset = EVAL_MODEL_PRESETS[id];
  if (!preset) {
    throw new Error(`Unknown model preset "${id}". Available: ${Object.keys(EVAL_MODEL_PRESETS).join(', ')}`);
  }
  return preset;
}

export function toRuntimeOptions(preset: EvalModelPreset, maxTurns?: number): RuntimeOptions {
  const apiKey = readEnv(preset.apiKeyEnv);
  if (!apiKey) {
    throw new Error(`Model preset "${preset.id}" requires ${preset.apiKeyEnv} to be set.`);
  }
  if (!preset.model) {
    throw new Error(`Model preset "${preset.id}" has no model. Set the matching model environment variable.`);
  }
  return {
    apiKey,
    apiType: preset.apiType,
    model: preset.model,
    baseURL: preset.baseURL,
    permissionMode: 'bypassPermissions',
    maxTurns: maxTurns ?? preset.runtimeDefaults?.maxTurns ?? 30,
    thinking: preset.runtimeDefaults?.thinking,
    promptCache: preset.runtimeDefaults?.promptCache,
  };
}
