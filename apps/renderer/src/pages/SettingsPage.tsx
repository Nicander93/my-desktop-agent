import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { GeneralSettings } from '@/components/settings/GeneralSettings';
import { ModelSettings } from '@/components/settings/ModelSettings';
import { McpSettings } from '@/components/settings/McpSettings';

const settingsTabs = [
  { id: 'general', label: '通用' },
  { id: 'model', label: '模型配置' },
  { id: 'mcp', label: 'MCP' },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');

  return (
    <div className="flex flex-col h-full min-h-0">
      <Header title="设置" />
      
      <div className="flex-1 flex min-h-0">
        <nav className="w-48 shrink-0 border-r border-[var(--color-sidebar-border)] p-4">
          <div className="space-y-1">
            {settingsTabs.map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start",
                  activeTab === tab.id && "bg-[var(--color-primary-100)] text-[var(--color-primary-700)] font-medium"
                )}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </nav>
        
        <ScrollArea className="flex-1 min-h-0 p-6">
          {activeTab === 'general' && <GeneralSettings />}
          {activeTab === 'model' && <ModelSettings />}
          {activeTab === 'mcp' && <McpSettings />}
        </ScrollArea>
      </div>
    </div>
  );
}