/** OpenAI-compatible 模型连接配置，由 Electron 主进程持久化。 */
export interface ModelConfig {
  id: string;
  name: string;
  provider: 'openai-compatible';
  baseURL: string;
  apiKey: string | null;
  model: string;
  enabled: boolean;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ModelConfigInput {
  name: string;
  provider?: 'openai-compatible';
  baseURL: string;
  apiKey?: string | null;
  model: string;
  enabled?: boolean;
  isDefault?: boolean;
}

export interface ModelConnectionTestResult {
  success: boolean;
  models?: string[];
  error?: string;
}
