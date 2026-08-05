/** 应用运行时路径与 bundled 命令解析 */
import { describe, it, expect } from "vitest";
import { normalize, join } from "path";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  getAppRuntimePaths,
  buildAppLevelEnv,
  buildCodingEnv,
  buildBundledPathEnv,
  getBundledPathSegments,
  getGitBashRoot,
  resolveBundledCommand,
  resolveCommandIfBundled,
} from "../src/runtime/paths.js";
import {
  getPythonPathSegments,
  getPythonRuntimeRecordPath,
} from "../src/runtime/python.js";

const home = "C:/Users/Test";

/**
 * 规范化断言中的跨平台路径分隔符。
 */
function n(path: string): string {
  return normalize(path);
}

describe("getAppRuntimePaths", () => {
  it("builds expected directory layout", () => {
    const paths = getAppRuntimePaths(home);
    expect(paths.root).toBe(n("C:/Users/Test/.desktop-agent"));
    expect(paths.binaries.node).toBe(
      n("C:/Users/Test/.desktop-agent/binaries/node"),
    );
    expect(paths.binaries.git).toBe(
      n("C:/Users/Test/.desktop-agent/binaries/git/cmd"),
    );
    expect(paths.store.npmPrefix).toBe(
      n("C:/Users/Test/.desktop-agent/store/npm/prefix"),
    );
    expect(paths.store.uvTools).toBe(
      n("C:/Users/Test/.desktop-agent/store/uv/tools"),
    );
  });
});

describe("buildAppLevelEnv", () => {
  it("prepends bundled paths and sets store env on Windows", () => {
    const paths = getAppRuntimePaths(home);
    const env = buildAppLevelEnv(
      paths,
      { PATH: "C:/Windows/system32" },
      "win32",
    );

    expect(env.PATH).toContain(paths.binaries.node);
    expect(env.PATH).toContain(join(paths.binaries.root, "git", "cmd"));
    expect(env.PATH).toContain("C:/Windows/system32");
    expect(env.NPM_CONFIG_PREFIX).toBe(paths.store.npmPrefix);
    expect(env.UV_TOOL_DIR).toBe(paths.store.uvTools);
  });
});

describe("buildCodingEnv", () => {
  it("keeps bundled PATH without npm prefix", () => {
    const paths = getAppRuntimePaths(home);
    const env = buildCodingEnv(paths, { PATH: "C:/existing" }, "win32");

    expect(env.PATH).toContain(paths.binaries.node);
    expect(env.NPM_CONFIG_PREFIX).toBeUndefined();
    expect(env.UV_CACHE_DIR).toBe(paths.store.uvCache);
  });
});

describe("getBundledPathSegments", () => {
  it("includes git-bash shell dirs on Windows", () => {
    const paths = getAppRuntimePaths(home);
    const segments = getBundledPathSegments(paths, "win32");
    expect(segments).toContain(join(getGitBashRoot(paths), "usr", "bin"));
    expect(segments).toContain(join(getGitBashRoot(paths), "bin"));
    expect(segments).toContain(paths.binaries.git);
    expect(segments).toContain(paths.binaries.node);
  });

  it("includes python shims when runtime record exists", () => {
    const storeRoot = join(tmpdir(), `desktop-agent-python-test-${Date.now()}`);
    const pythonExe = join(storeRoot, "python", "cpython-3.12", "python.exe");
    const shimsDir = join(storeRoot, "shims");
    mkdirSync(join(storeRoot, "python", "cpython-3.12"), { recursive: true });
    writeFileSync(pythonExe, "", "utf-8");
    writeFileSync(
      getPythonRuntimeRecordPath(storeRoot),
      JSON.stringify({
        version: "3.12",
        pythonExe,
        shimsDir,
      }),
      "utf-8",
    );

    const paths = getAppRuntimePaths(home);
    paths.store.root = storeRoot;
    const segments = getBundledPathSegments(paths, "win32");

    expect(segments).toContain(shimsDir);
    expect(segments).toContain(join(storeRoot, "python", "cpython-3.12"));
    expect(getPythonPathSegments(storeRoot)).toEqual([
      shimsDir,
      join(storeRoot, "python", "cpython-3.12"),
    ]);
  });
});

describe("buildBundledPathEnv", () => {
  it("uses colon separator on unix", () => {
    const paths = getAppRuntimePaths("/home/test");
    const pathValue = buildBundledPathEnv(paths, "/usr/bin", "linux");
    expect(pathValue.startsWith(`${paths.binaries.node}:`)).toBe(true);
    expect(pathValue).toContain("/usr/bin");
  });
});

describe("resolveBundledCommand", () => {
  it("resolves Windows executables", () => {
    const paths = getAppRuntimePaths(home);
    expect(resolveBundledCommand(paths, "npx", "win32")).toBe(
      n("C:/Users/Test/.desktop-agent/binaries/node/npx.cmd"),
    );
    expect(resolveBundledCommand(paths, "git", "win32")).toBe(
      n("C:/Users/Test/.desktop-agent/binaries/git/cmd/git.exe"),
    );
    expect(resolveBundledCommand(paths, "uvx", "win32")).toBe(
      n("C:/Users/Test/.desktop-agent/binaries/uv/uvx.exe"),
    );
  });
});

describe("resolveCommandIfBundled", () => {
  it("resolves known commands only", () => {
    const paths = getAppRuntimePaths(home);
    expect(resolveCommandIfBundled(paths, "npx", "win32")).toContain("npx.cmd");
    expect(resolveCommandIfBundled(paths, "custom-tool", "win32")).toBe(
      "custom-tool",
    );
  });
});
