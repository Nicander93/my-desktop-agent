/**
 * 把 DB/设置里的 Skill 注册进 open-agent-sdk；enabled 或本轮 / 提及才注册。
 * managedSkillNames 跟踪本 runtime 注册过的名字，禁用或切 session 时 unregister。
 */
import { registerSkill, unregisterSkill } from '@codeany/open-agent-sdk';
import { getSkillPromptBody, type RuntimeSkillDefinition } from '@desktop-agent/shared';

const managedSkillNames = new Set<string>();

/** 与 mentionNames 合并决定本轮活跃 Skill；离开集合的会 unregister */
export function syncRuntimeSkills(
  skills: RuntimeSkillDefinition[],
  mentionNames: string[] = [],
): void {
  const mentionSet = new Set(mentionNames);
  const active = skills.filter((skill) => skill.enabled || mentionSet.has(skill.name));
  const activeNames = new Set(active.map((skill) => skill.name));

  for (const name of [...managedSkillNames]) {
    if (!activeNames.has(name)) {
      unregisterSkill(name);
      managedSkillNames.delete(name);
    }
  }

  for (const skill of active) {
    const body = getSkillPromptBody(skill.contentCache);
    registerSkill({
      name: skill.name,
      description: skill.description || skill.displayName || skill.name,
      userInvocable: true,
      whenToUse: skill.description || undefined,
      isEnabled: () => true,
      async getPrompt(args) {
        let text = body;
        if (args?.trim()) {
          text += `\n\nAdditional context from user: ${args.trim()}`;
        }
        return [{ type: 'text', text }];
      },
    });
    managedSkillNames.add(skill.name);
  }
}

/** session 结束或 runtime 销毁时清空注册 */
export function clearRuntimeSkills(): void {
  for (const name of managedSkillNames) {
    unregisterSkill(name);
  }
  managedSkillNames.clear();
}
