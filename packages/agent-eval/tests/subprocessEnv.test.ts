/** 覆盖评测子进程环境的 Profile 选择与隔离约束。 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DESKTOP_AGENT_BASH_ENV,
  getGitBashRoot,
  getAppRuntimePaths,
} from "@desktop-agent/shared/runtime";
import { buildEvalSubprocessEnv } from "../src/subprocessEnv.js";

describe("buildEvalSubprocessEnv", () => {
  it("injects bundled Git Bash on Windows", () => {
    const home = "C:/Users/Eval";
    const paths = getAppRuntimePaths(home);
    const bash = join(getGitBashRoot(paths), "bin", "bash.exe");
    const env = buildEvalSubprocessEnv({
      platform: "win32",
      homeDir: home,
      pathEnv: "C:/Windows/system32",
      exists: (p) => p === bash,
    });

    expect(env[DESKTOP_AGENT_BASH_ENV]).toBe(bash);
    expect(env.MSYSTEM).toBe("MINGW64");
    expect(env.PATH).toContain(getGitBashRoot(paths));
    expect(env.PATH).toContain("C:/Windows/system32");
  });

  it("throws when bundled Git Bash is missing on Windows", () => {
    expect(() =>
      buildEvalSubprocessEnv({
        platform: "win32",
        homeDir: "C:/Users/Missing",
        exists: () => false,
      }),
    ).toThrow(/pnpm setup:binaries/);
  });

  it("skips Git Bash injection on non-Windows", () => {
    const env = buildEvalSubprocessEnv({
      platform: "linux",
      homeDir: "/home/eval",
      pathEnv: "/usr/bin",
      exists: () => false,
    });
    expect(env[DESKTOP_AGENT_BASH_ENV]).toBeUndefined();
    expect(env.PATH).toContain("/usr/bin");
  });
});
