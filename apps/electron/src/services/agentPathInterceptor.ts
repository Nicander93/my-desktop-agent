import { AgentRuntime } from '@desktop-agent/agent-runtime';
import { checkPathAccess, grantAlwaysAllow } from './pathGuard';
import { BrowserWindow } from 'electron';

export function setupPathInterceptor(
  runtime: AgentRuntime,
  getWindow: () => BrowserWindow | null
): void {
  const originalCreateAgent = runtime.createAgent.bind(runtime);

  runtime.createAgent = function interceptedCreateAgent(sessionId: string) {
    const agent = originalCreateAgent(sessionId);

    const originalQuery = agent.query.bind(agent);
    agent.query = async function* interceptedQuery(input: string) {
      yield* originalQuery(input);
    };

    return agent;
  };
}
