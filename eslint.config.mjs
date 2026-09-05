import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Flat config, consuming eslint-config-next's own flat exports directly.
 *
 * Not via `FlatCompat`: the compat layer re-validates the shared config against
 * the legacy schema, and eslint-config-next 16 has circular references between
 * its plugin objects that the validator cannot serialise — it fails with
 * "Converting circular structure to JSON" before linting a single file.
 * Since the package now ships flat config, the compat shim has nothing left to
 * do anyway.
 */
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      // Generated SQL and Drizzle's own journal — not source.
      "drizzle/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },

  ...coreWebVitals,
  ...nextTypescript,

  {
    rules: {
      // `any` erases the type safety the rest of the codebase depends on. An
      // unavoidable one has to be written as an explicit, commented exception.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // A stray console.log in a request handler is how personal data reaches a
      // log aggregator. Structured, redacting logging goes through
      // src/server/observability/logger.ts, which is the only exception below.
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },

  {
    // Scripts, tests and the logger itself run outside a request, where writing
    // to stdout is the entire point.
    files: [
      // Any extension: the screenshot capture is .mjs so it can be run with
      // plain node, and the original glob only matched .ts.
      "scripts/**/*.{ts,mts,mjs,js}",
      "tests/**/*.{ts,tsx}",
      "src/server/observability/logger.ts",
      "*.config.{ts,mts,mjs}",
    ],
    rules: { "no-console": "off" },
  },
];

export default config;
