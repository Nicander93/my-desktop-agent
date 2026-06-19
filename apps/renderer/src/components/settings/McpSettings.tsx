import { useState } from 'react';
import { Plus, Trash2, Server } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface McpServer {
  id: string;
  name: string;
  type: 'local' | 'remote';
  command?: string;
  url?: string;
  enabled: boolean;
}

export function McpSettings() {
  const [servers, setServers] = useState<McpServer[]>([
    { id: '1', name: 'filesystem', type: 'local', command: 'npx -y @modelcontextprotocol/server-filesystem', enabled: true }
  ]);

  const addServer = () => {
    setServers([...servers, { 
      id: Date.now().toString(), 
      name: '', 
      type: 'local', 
      command: '', 
      enabled: true 
    }]);
  };

  const removeServer = (id: string) => {
    setServers(servers.filter(s => s.id !== id));
  };

  const toggleServer = (id: string) => {
    setServers(servers.map(s => 
      s.id === id ? { ...s, enabled: !s.enabled } : s
    ));
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">MCP 服务器</h2>
        <Button onClick={addServer} className="gap-2">
          <Plus size={16} />
          添加服务器
        </Button>
      </div>
      
      <div className="space-y-4">
        {servers.map((server) => (
          <div key={server.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Server size={16} className="text-gray-500" />
                <Input
                  value={server.name}
                  onChange={(e) => {
                    setServers(servers.map(s => 
                      s.id === server.id ? { ...s, name: e.target.value } : s
                    ));
                  }}
                  className="font-medium bg-transparent border-none focus:outline-none w-auto"
                  placeholder="服务器名称"
                />
                <Badge variant={server.enabled ? "default" : "secondary"}>
                  {server.enabled ? "启用" : "禁用"}
                </Badge>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => toggleServer(server.id)}
                >
                  <div className={`
                    w-10 h-5 rounded-full transition-colors relative
                    ${server.enabled ? 'bg-[var(--color-primary-500)]' : 'bg-gray-300'}
                  `}>
                    <div className={`
                      w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform
                      ${server.enabled ? 'left-5' : 'left-0.5'}
                    `} />
                  </div>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeServer(server.id)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">类型</label>
                <select
                  value={server.type}
                  onChange={(e) => {
                    setServers(servers.map(s => 
                      s.id === server.id ? { ...s, type: e.target.value as 'local' | 'remote' } : s
                    ));
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)]"
                >
                  <option value="local">本地 (stdio)</option>
                  <option value="remote">远程 (SSE)</option>
                </select>
              </div>
              
              {server.type === 'local' ? (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">启动命令</label>
                  <Input
                    value={server.command || ''}
                    onChange={(e) => {
                      setServers(servers.map(s => 
                        s.id === server.id ? { ...s, command: e.target.value } : s
                      ));
                    }}
                    placeholder="npx -y @modelcontextprotocol/server-..."
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">URL</label>
                  <Input
                    value={server.url || ''}
                    onChange={(e) => {
                      setServers(servers.map(s => 
                        s.id === server.id ? { ...s, url: e.target.value } : s
                      ));
                    }}
                    placeholder="http://localhost:3001/sse"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}