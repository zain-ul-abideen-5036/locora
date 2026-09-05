import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * Two projects, because the two kinds of test have incompatible needs.
 *
 * `unit` covers pure logic and React components: no database, jsdom where a
 * component needs a DOM, and fast enough to run on every save.
 *
 * `integration` exercises the real service layer against a real Postgres
 * database, so it needs a node environment, a longer timeout, and must run
 * serially — the suites share one database and would otherwise interleave
 * writes. It is skipped with a clear message when TEST_DATABASE_URL is unset,
 * rather than failing and looking like a broken build.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
          setupFiles: ["./tests/setup/unit.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["./tests/setup/integration.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
