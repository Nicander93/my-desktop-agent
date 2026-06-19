declare global {
  interface Window {
    electronAPI?: {
      agent: {
        createSession: (sessionId: string) => Promise<{ success: boolean; sessionId: string }>;
        sendMessage: (sessionId: string, content: string) => Promise<{ success: boolean; messages?: unknown[]; error?: string }>;
        prompt: (sessionId: string, content: string) => Promise<{ success: boolean; content?: string; error?: string }>;
        getMessages: (sessionId: string) => Promise<{ success: boolean; messages?: unknown[] }>;
        closeSession: (sessionId: string) => Promise<{ success: boolean }>;
        onStreamMessage: (
          callback: (data: { sessionId: string; message: unknown }) => void
        ) => (() => void) | void;
      };
    };
  }
}

export {};
