import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ModelConfig {
  id: string;
  provider: string;
  apiKey: string;
  model: string;
}

export function ModelSettings() {
  const [models, setModels] = useState<ModelConfig[]>([
    { id: '1', provider: 'openai', apiKey: 'sk-...', model: 'gpt-4' }
  ]);

  const addModel = () => {
    setModels([...models, { 
      id: Date.now().toString(), 
      provider: 'openai', 
      apiKey: '', 
      model: 'gpt-4' 
    }]);
  };

  const removeModel = (id: string) => {
    setModels(models.filter(m => m.id !== id));
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-800">模型配置</h2>
        <Button onClick={addModel} className="gap-2">
          <Plus size={16} />
          添加模型
        </Button>
      </div>
      
      <div className="space-y-4">
        {models.map((model) => (
          <div key={model.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <select
                  value={model.provider}
                  onChange={(e) => {
                    setModels(models.map(m => 
                      m.id === model.id ? { ...m, provider: e.target.value } : m
                    ));
                  }}
                  className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)]"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
                <Badge variant="secondary">{model.model}</Badge>
              </div>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeModel(model.id)}
                className="text-gray-400 hover:text-red-500"
              >
                <Trash2 size={16} />
              </Button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">API Key</label>
                <Input
                  type="password"
                  value={model.apiKey}
                  onChange={(e) => {
                    setModels(models.map(m => 
                      m.id === model.id ? { ...m, apiKey: e.target.value } : m
                    ));
                  }}
                  placeholder="sk-..."
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-600 mb-1">模型</label>
                <Input
                  value={model.model}
                  onChange={(e) => {
                    setModels(models.map(m => 
                      m.id === model.id ? { ...m, model: e.target.value } : m
                    ));
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}