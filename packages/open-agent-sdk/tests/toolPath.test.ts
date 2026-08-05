/** 覆盖 Windows/MSYS 与 POSIX 工具路径解析，防止越出 workspace。 */
import { describe, expect, it } from "vitest";
import { msysPathToHost, resolveToolPath } from "../src/utils/toolPath.js";

describe("msysPathToHost", () => {
  it("converts /d/code/... to D:\\code\\...", () => {
    expect(msysPathToHost("/d/code/my-desktop-agent/workspace/a.txt")).toBe(
      "D:\\code\\my-desktop-agent\\workspace\\a.txt",
    );
  });

  it("converts /cygdrive/c/Users/...", () => {
    expect(msysPathToHost("/cygdrive/c/Users/PC/file.txt")).toBe(
      "C:\\Users\\PC\\file.txt",
    );
  });

  it("does not treat /usr as a drive", () => {
    expect(msysPathToHost("/usr/bin/bash")).toBe("/usr/bin/bash");
  });

  it("leaves Windows and relative paths unchanged", () => {
    expect(msysPathToHost("D:\\code\\a.txt")).toBe("D:\\code\\a.txt");
    expect(msysPathToHost("input/sales.csv")).toBe("input/sales.csv");
  });
});

describe("resolveToolPath", () => {
  it("resolves MSYS path against cwd on win32", () => {
    expect(resolveToolPath("D:\\workspace", "/d/code/a.txt", "win32")).toBe(
      "D:\\code\\a.txt",
    );
  });

  it("resolves relative path against cwd", () => {
    expect(resolveToolPath("D:\\workspace", "input/sales.csv", "win32")).toBe(
      "D:\\workspace\\input\\sales.csv",
    );
  });

  it("skips MSYS conversion on linux", () => {
    expect(resolveToolPath("/home/ws", "/d/code/a.txt", "linux")).toBe(
      "/d/code/a.txt",
    );
  });

  it("maps POSIX /workspace paths into cwd on win32 instead of drive root", () => {
    expect(
      resolveToolPath(
        "D:\\eval\\run\\workspace",
        "/workspace/process.py",
        "win32",
      ),
    ).toBe("D:\\eval\\run\\workspace\\workspace\\process.py");
    expect(
      resolveToolPath("D:\\eval\\run\\workspace", "/usr/bin/bash", "win32"),
    ).toBe("D:\\eval\\run\\workspace\\usr\\bin\\bash");
  });
});
