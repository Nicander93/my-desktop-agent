import { ipcMain } from 'electron';
import * as skillService from '../services/skillService';
import type { SkillInput } from '@desktop-agent/shared';

export function registerSkillHandlers(): void {
  ipcMain.handle('skill:get-all', () => {
    try {
      return { success: true, skills: skillService.getAllSkills() };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '加载失败' };
    }
  });

  ipcMain.handle('skill:get-catalog', () => {
    try {
      return { success: true, catalog: skillService.getCatalog() };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '加载失败' };
    }
  });

  ipcMain.handle('skill:get-mentionable', () => {
    try {
      return { success: true, skills: skillService.listMentionableSkills() };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '加载失败' };
    }
  });

  ipcMain.handle('skill:create', (_, input: SkillInput) => {
    try {
      const skill = skillService.createSkill(input);
      return { success: true, skill };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '创建失败' };
    }
  });

  ipcMain.handle('skill:update', (_, id: string, updates: Partial<SkillInput> & { enabled?: boolean }) => {
    try {
      const skill = skillService.updateSkill(id, updates);
      if (!skill) return { success: false, error: 'Skill 不存在' };
      return { success: true, skill };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '更新失败' };
    }
  });

  ipcMain.handle('skill:delete', (_, id: string) => {
    try {
      skillService.deleteSkill(id);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '删除失败' };
    }
  });

  ipcMain.handle('skill:install-catalog', async (_, catalogId: string) => {
    try {
      const skill = await skillService.installFromCatalog(catalogId);
      return { success: true, skill };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '安装失败' };
    }
  });

  ipcMain.handle('skill:import-url', async (_, name: string, url: string) => {
    try {
      const skill = await skillService.importFromUrl(name, url);
      return { success: true, skill };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '导入失败' };
    }
  });

  ipcMain.handle('skill:import-local', async (_, name: string, localPath: string) => {
    try {
      const skill = await skillService.importFromLocalPath(name, localPath);
      return { success: true, skill };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '导入失败' };
    }
  });

  ipcMain.handle('skill:refresh', async (_, id: string) => {
    try {
      const skill = await skillService.refreshSkillContent(id);
      if (!skill) return { success: false, error: 'Skill 不存在' };
      return { success: true, skill };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : '刷新失败' };
    }
  });
}
<<<<<<< HEAD
=======

export function getEnabledSkillsPrompt(): string {
  return skillService.getEnabledSkillsPrompt();
}

export function getSkillMentionPrompt(names: string[]): string {
  return skillService.getSkillMentionPrompt(names);
}

export function getEnabledSkillNames(): string[] {
  return skillService.getEnabledSkills().map((skill) => skill.name);
}
>>>>>>> e2ca66262520acbed1d525d6937a13d2d943b570
