/** 覆盖 .env 文件加载的优先级、解析与不覆盖既有环境变量约束。 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  findProjectRoot,
  loadEnvFile,
  loadProjectEnv,
} from "../src/env/loadEnvFile.js";

const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    process.env[key] = value;
  }
});

describe("loadEnvFile", () => {
  it("loads values without overriding existing process.env entries", () => {
    const dir = mkdtempSync(join(tmpdir(), "load-env-"));
    writeFileSync(
      join(dir, ".env"),
      "CODEANY_MODEL=from-file\nEXISTING=from-file\n",
      "utf8",
    );
    process.env.EXISTING = "from-process";

    loadEnvFile(join(dir, ".env"));

    expect(process.env.CODEANY_MODEL).toBe("from-file");
    expect(process.env.EXISTING).toBe("from-process");
  });

  it("finds monorepo root and loads project env files", () => {
    const root = mkdtempSync(join(tmpdir(), "project-root-"));
    writeFileSync(
      join(root, "pnpm-workspace.yaml"),
      "packages:\n  - packages/*\n",
      "utf8",
    );
    writeFileSync(
      join(root, ".env"),
      "CODEANY_BASE_URL=http://localhost:11434/v1\n",
      "utf8",
    );

    expect(findProjectRoot(root)).toBe(root);
    loadProjectEnv(root);
    expect(process.env.CODEANY_BASE_URL).toBe("http://localhost:11434/v1");
  });
});
