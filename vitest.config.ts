import { defineConfig } from "vitest/config";

// Workspace-wide vitest config. Each package's *.test.ts files run in the
// node environment by default; per-test setup that needs DOM should declare
// `// @vitest-environment jsdom` at the top of the test file.
export default defineConfig({
  test: {
    include: ["packages/**/src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    environment: "node",
    globals: false,
    reporters: ["default"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
