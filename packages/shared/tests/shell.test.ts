/** 覆盖 shared Shell/Git Bash 路径解析的跨平台纯函数。 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import {
  resolveGitBashPath,
  getGitShellPathSegments,
} from "../src/runtime/shell.js";

describe("resolveGitBashPath", () => {
  it("prefers PortableGit bin/bash.exe", () => {
    const gitRoot = "C:/git";
    const bash = join(gitRoot, "bin", "bash.exe");
    const path = resolveGitBashPath(gitRoot, (candidate) => candidate === bash);
    expect(path).toBe(bash);
  });

  it("falls back to usr/bin/bash.exe", () => {
    const gitRoot = "C:/git";
    const bash = join(gitRoot, "usr", "bin", "bash.exe");
    const path = resolveGitBashPath(gitRoot, (candidate) => candidate === bash);
    expect(path).toBe(bash);
  });
});

describe("getGitShellPathSegments", () => {
  it("includes usr/bin and bin", () => {
    const gitRoot = "C:/git";
    const segments = getGitShellPathSegments(gitRoot);
    expect(segments).toContain(join(gitRoot, "usr", "bin"));
    expect(segments).toContain(join(gitRoot, "bin"));
    expect(segments).toContain(join(gitRoot, "cmd"));
  });
});
