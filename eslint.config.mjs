import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/target/**",
      "**/gen/**",
      "**/.vite/**",
      "**/data/**",
      "packages/desktop/src-tauri/target/**",
      "packages/desktop/src-tauri/gen/**",
      "**/*.config.js",
      "**/*.config.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/backend/src/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ["packages/desktop/src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["error", "warn", "info"] }],
    },
  },
  // CLI scripts + worker: console.log is the expected log output
  {
    files: [
      "packages/backend/src/cmd/**/*.ts",
      "packages/backend/src/modules/worker/**/*.ts",
    ],
    rules: { "no-console": "off" },
  },
);
