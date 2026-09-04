import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "drizzle/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // `any` erases the type safety the rest of the codebase depends on. An
      // unavoidable one must be written as an explicit, commented exception.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // A stray console.log in a request handler on a platform holding
      // missing-person data is how personal data ends up in a log aggregator.
      // Structured logging goes through src/server/observability/logger.ts.
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },
  {
    // Scripts and tests run outside the request path, where writing to stdout
    // is the point.
    files: ["scripts/**/*.ts", "tests/**/*.ts", "tests/**/*.tsx", "src/server/observability/logger.ts"],
    rules: { "no-console": "off" },
  },
];
