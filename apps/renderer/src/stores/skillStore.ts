import { create } from 'zustand';
import type { SkillCatalogEntry, SkillRecord } from '@desktop-agent/shared';

type CatalogEntry = SkillCatalogEntry & { installed: boolean };

interface SkillStore {
  skills: SkillRecord[];
  catalog: CatalogEntry[];
  mentionable: Array<{ name: string; displayName: string }>;
  loading: boolean;
  loadAll: () => Promise<void>;
  loadMentionable: () => Promise<void>;
  installCatalog: (catalogId: string) => Promise<{ error?: string }>;
  updateSkill: (id: string, updates: Partial<SkillRecord>) => Promise<string | null>;
  deleteSkill: (id: string) => Promise<string | null>;
  importUrl: (name: string, url: string) => Promise<{ error?: string }>;
  importLocal: (name: string, localPath: string) => Promise<{ error?: string }>;
  refreshSkill: (id: string) => Promise<{ error?: string }>;
}

export const useSkillStore = create<SkillStore>((set, get) => ({
  skills: [],
  catalog: [],
  mentionable: [],
  loading: false,

  loadAll: async () => {
    if (!window.electronAPI?.skill) return;
    set({ loading: true });
    try {
      const [allResult, catalogResult] = await Promise.all([
        window.electronAPI.skill.getAll(),
        window.electronAPI.skill.getCatalog(),
      ]);
      set({
        skills: allResult.success ? allResult.skills ?? [] : [],
        catalog: catalogResult.success ? catalogResult.catalog ?? [] : [],
      });
      await get().loadMentionable();
    } finally {
      set({ loading: false });
    }
  },

  loadMentionable: async () => {
    if (!window.electronAPI?.skill) return;
    const result = await window.electronAPI.skill.getMentionable();
    if (result.success) {
      set({ mentionable: result.skills ?? [] });
    }
  },

  installCatalog: async (catalogId) => {
    if (!window.electronAPI?.skill) return { error: 'Skill API 不可用' };
    const result = await window.electronAPI.skill.installCatalog(catalogId);
    if (!result.success) return { error: result.error || '安装失败' };
    await get().loadAll();
    return {};
  },

  updateSkill: async (id, updates) => {
    if (!window.electronAPI?.skill) return 'Skill API 不可用';
    const result = await window.electronAPI.skill.update(id, {
      name: updates.name,
      displayName: updates.displayName,
      description: updates.description,
      enabled: updates.enabled,
    });
    if (!result.success) return result.error || '更新失败';
    await get().loadAll();
    return null;
  },

  deleteSkill: async (id) => {
    if (!window.electronAPI?.skill) return 'Skill API 不可用';
    const result = await window.electronAPI.skill.delete(id);
    if (!result.success) return result.error || '删除失败';
    await get().loadAll();
    return null;
  },

  importUrl: async (name, url) => {
    if (!window.electronAPI?.skill) return { error: 'Skill API 不可用' };
    const result = await window.electronAPI.skill.importUrl(name, url);
    if (!result.success) return { error: result.error || '导入失败' };
    await get().loadAll();
    return {};
  },

  importLocal: async (name, localPath) => {
    if (!window.electronAPI?.skill) return { error: 'Skill API 不可用' };
    const result = await window.electronAPI.skill.importLocal(name, localPath);
    if (!result.success) return { error: result.error || '导入失败' };
    await get().loadAll();
    return {};
  },

  refreshSkill: async (id) => {
    if (!window.electronAPI?.skill) return { error: 'Skill API 不可用' };
    const result = await window.electronAPI.skill.refresh(id);
    if (!result.success) return { error: result.error || '刷新失败' };
    await get().loadAll();
    return {};
  },
}));
