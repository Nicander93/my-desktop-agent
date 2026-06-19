import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Agent API
  agent: {
    createSession: (sessionId: string) => 
      ipcRenderer.invoke('agent:create-session', sessionId),
    
    sendMessage: (sessionId: string, content: string) => 
      ipcRenderer.invoke('agent:send-message', sessionId, content),
    
    prompt: (sessionId: string, content: string) => 
      ipcRenderer.invoke('agent:prompt', sessionId, content),
    
    getMessages: (sessionId: string) => 
      ipcRenderer.invoke('agent:get-messages', sessionId),
    
    closeSession: (sessionId: string) => 
      ipcRenderer.invoke('agent:close-session', sessionId),
    
    onStreamMessage: (callback: (data: { sessionId: string; message: any }) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: { sessionId: string; message: any }) =>
        callback(data);
      ipcRenderer.on('agent:stream-message', listener);
      return () => {
        ipcRenderer.removeListener('agent:stream-message', listener);
      };
    }
  }
});