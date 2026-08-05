/**
 * Bundled Skill: review
 *
 * Review code changes (PR or local diff) for issues and improvements.
 */

import { registerSkill } from "../registry.js";
import type { SkillContentBlock } from "../types.js";

const REVIEW_PROMPT = `Review the current code changes for potential issues. Follow these steps:

1. Run \`git diff\` to see uncommitted changes, or \`git diff main...HEAD\` for branch changes
2. For each changed file, analyze:
   - **Correctness**: Logic errors, edge cases, off-by-one errors
   - **Security**: Injection vulnerabilities, auth issues, data exposure
   - **Performance**: N+1 queries, unnecessary allocations, blocking I/O
   - **Style**: Naming, consistency with surrounding code, readability
   - **Testing**: Are the changes adequately tested?
3. Provide a summary with:
   - Critical issues (must fix)
   - Suggestions (nice to have)
   - Questions (need clarification)

Be specific: reference file names, line numbers, and suggest fixes.`;

/**
 * 注册代码审查 Skill，并声明只读检查阶段可使用的工具集。
 */
export function registerReviewSkill(): void {
  registerSkill({
    name: "review",
    description:
      "Review code changes for correctness, security, performance, and style issues.",
    aliases: ["review-pr", "cr"],
    allowedTools: ["Bash", "Read", "Glob", "Grep"],
    userInvocable: true,
    /**
     * 返回审查检查表，并以用户参数限定可选的关注范围。
     */
    async getPrompt(args): Promise<SkillContentBlock[]> {
      let prompt = REVIEW_PROMPT;
      if (args.trim()) {
        prompt += `\n\nFocus area: ${args}`;
      }
      return [{ type: "text", text: prompt }];
    },
  });
}
