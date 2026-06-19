import { createAgent, Agent, AgentOptions, SDKMessage, SDKAssistantMessage } from '@codeany/open-agent-sdk';
import { Message, ToolResult } from '@desktop-agent/shared';

export interface RuntimeOptions {
  apiKey?: string;
  model?: string;
  apiType?: 'anthropic-messages' | 'openai-completions';
  baseURL?: string;
  cwd?: string;
  maxTurns?: number;
  permissionMode?: 'default' | 'acceptEdits' | 'dontAsk' | 'bypassPermissions' | 'plan';
}

export class AgentRuntime {
  private agents: Map<string, Agent> = new Map();
  private options: RuntimeOptions;

  constructor(options: RuntimeOptions = {}) {
    this.options = {
      permissionMode: 'bypassPermissions',
      maxTurns: 10,
      ...options
    };
  }

  createAgent(sessionId: string): Agent {
    const agentOptions: AgentOptions = {
      apiKey: this.options.apiKey,
      model: this.options.model,
      apiType: this.options.apiType,
      baseURL: this.options.baseURL,
      cwd: this.options.cwd,
      maxTurns: this.options.maxTurns,
      permissionMode: this.options.permissionMode,
      persistSession: true,
      sessionId,
      stream: true
    };

    const agent = createAgent(agentOptions);
    this.agents.set(sessionId, agent);
    return agent;
  }

  getAgent(sessionId: string): Agent | undefined {
    return this.agents.get(sessionId);
  }

  async sendMessage(sessionId: string, content: string): Promise<AsyncGenerator<SDKMessage>> {
    let agent = this.agents.get(sessionId);
    if (!agent) {
      agent = this.createAgent(sessionId);
    }

    return agent.query(content);
  }

  async prompt(sessionId: string, content: string): Promise<string> {
    let agent = this.agents.get(sessionId);
    if (!agent) {
      agent = this.createAgent(sessionId);
    }

    const result = await agent.prompt(content);
    return result.text;
  }

  async executeTool(sessionId: string, toolName: string, input: unknown): Promise<ToolResult> {
    const agent = this.agents.get(sessionId);
    if (!agent) {
      return { success: false, error: 'Agent not found' };
    }

    try {
      const result = await agent.prompt(`Use tool ${toolName} with input: ${JSON.stringify(input)}`);
      return { success: true, data: result.text };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  getMessages(sessionId: string): Message[] {
    const agent = this.agents.get(sessionId);
    if (!agent) return [];

    const messages = agent.getMessages();
    return messages.map((msg, index) => {
      // 处理不同类型的 message
      if (msg.type === 'user' && msg.message) {
        return {
          id: `msg-${sessionId}-${index}`,
          role: 'user' as const,
          content: typeof msg.message.content === 'string' 
            ? msg.message.content 
            : JSON.stringify(msg.message.content),
          timestamp: Date.now()
        };
      }
      if (msg.type === 'assistant' && msg.message) {
        const content = msg.message.content;
        const textContent = Array.isArray(content) 
          ? content.filter((b: any) => 'text' in b).map((b: any) => b.text).join('')
          : content;
        return {
          id: `msg-${sessionId}-${index}`,
          role: 'assistant' as const,
          content: textContent,
          timestamp: Date.now()
        };
      }
      return {
        id: `msg-${sessionId}-${index}`,
        role: 'assistant' as const,
        content: '',
        timestamp: Date.now()
      };
    });
  }

  async close(sessionId: string): Promise<void> {
    const agent = this.agents.get(sessionId);
    if (agent) {
      await agent.close();
      this.agents.delete(sessionId);
    }
  }

  async closeAll(): Promise<void> {
    for (const [sessionId, agent] of this.agents) {
      await agent.close();
    }
    this.agents.clear();
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}

// 导出类型
export type { Agent, AgentOptions } from '@codeany/open-agent-sdk';
export type { SDKMessage } from '@codeany/open-agent-sdk';