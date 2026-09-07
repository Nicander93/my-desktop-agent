import { existsSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const localTestEnvPath = fileURLToPath(
  new URL("./.env.test.local", import.meta.url),
);
if (existsSync(localTestEnvPath)) process.loadEnvFile(localTestEnvPath);

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
  },
});
