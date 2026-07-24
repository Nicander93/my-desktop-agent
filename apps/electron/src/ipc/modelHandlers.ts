import { ipcMain } from 'electron';
import type { ModelConfigInput } from '@desktop-agent/shared';
import * as modelConfigService from '../services/modelConfigService';

export function registerModelHandlers(): void {
  ipcMain.handle('model:get-all', () => {
    try { return { success: true, configs: modelConfigService.getAllModelConfigs() }; }
    catch (error) { return { success: false, error: error instanceof Error ? error.message : '加载失败' }; }
  });
  ipcMain.handle('model:create', (_, input: ModelConfigInput) => {
    try { return { success: true, config: modelConfigService.createModelConfig(input) }; }
    catch (error) { return { success: false, error: error instanceof Error ? error.message : '创建失败' }; }
  });
  ipcMain.handle('model:update', (_, id: string, updates: Partial<ModelConfigInput>) => {
    try {
      const config = modelConfigService.updateModelConfig(id, updates);
      return config ? { success: true, config } : { success: false, error: '模型配置不存在' };
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : '更新失败' }; }
  });
  ipcMain.handle('model:delete', (_, id: string) => {
    try { modelConfigService.deleteModelConfig(id); return { success: true }; }
    catch (error) { return { success: false, error: error instanceof Error ? error.message : '删除失败' }; }
  });
  ipcMain.handle('model:test-connection', async (_, input: ModelConfigInput) => {
    try { return modelConfigService.testModelConnection({ baseURL: input.baseURL, apiKey: input.apiKey ?? null }); }
    catch (error) { return { success: false, error: error instanceof Error ? error.message : '连接失败' }; }
  });
}
