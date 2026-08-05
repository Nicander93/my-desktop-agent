/** OpenAI-compatible 模型连接配置，由 Electron 主进程持久化。 */
export interface ModelConfig {
  id: string;
  name: string;
  provider: "openai-compatible";
  baseURL: string;
  apiKey: string | null;
  model: string;
  enabled: boolean;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * 创建或更新模型配置时可持久化的输入；未给出的可选项由服务应用默认值。
 */
export interface ModelConfigInput {
  name: string;
  provider?: "openai-compatible";
  baseURL: string;
  apiKey?: string | null;
  model: string;
  enabled?: boolean;
  isDefault?: boolean;
}

/**
 * 模型服务 `/models` 连通性探测的成功结果、可见模型或错误摘要。
 */
export interface ModelConnectionTestResult {
  success: boolean;
  models?: string[];
  error?: string;
}
