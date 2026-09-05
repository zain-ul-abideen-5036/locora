import { defineConfig, devices } from "@playwright/test";

import { loadEnv } from "./src/server/config/load-env";

loadEnv();

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * The database the end-to-end run uses.
 *
 * Separate from both production and the integration suite's database, and named
 * by its own variable, because the seed truncates it. Requiring an explicit
 * variable is what stops a stray `npm run test:e2e` from erasing somebody's
 * development data.
 */
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL;

/**
 * End-to-end tests, against a production build on a real database.
 *
 * `next start`, not `next dev`. Dev-mode rendering, the error overlay and
 * un-minified bundles behave differently enough that a passing dev-mode run
 * says little about what is deployed — and several things this suite checks,
 * such as security headers and static generation, only exist in a real build.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  // Serial. The suite shares one database and one seeded account; parallel
  // workers would interleave writes and produce failures that depend on timing
  // rather than on the code.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  /**
   * Each project presents a different client address.
   *
   * The rate limiter keys anonymous limits on the leftmost `x-forwarded-for`
   * entry, and sign-in allows ten attempts per ten minutes. Both projects run
   * the same journeys, so from one address their combined traffic legitimately
   * trips that limit — the limiter working correctly, but failing the suite for
   * the wrong reason. Two addresses make the projects independent, which is
   * also closer to what two real devices would look like.
   *
   * The limiter's own behaviour is covered properly in
   * tests/integration/rate-limit.test.ts rather than being worked around here.
   */
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        extraHTTPHeaders: { "x-forwarded-for": "203.0.113.10" },
      },
    },
    {
      // A real phone viewport and touch emulation. Mobile is not a narrower
      // desktop on this product — a report is plausibly filed on a phone, in a
      // hurry — so it is tested rather than assumed.
      name: "mobile",
      use: { ...devices["Pixel 7"], extraHTTPHeaders: { "x-forwarded-for": "203.0.113.20" } },
    },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next build && npx next start --port ${PORT}`,
        /**
         * Readiness is probed on the health endpoint, not the home page.
         *
         * The home page renders the live feed, so it depends on a migrated
         * database — pointing the probe at it turns "the schema is missing"
         * into a five-minute timeout with the real error buried in server logs.
         * The health endpoint answers 200 as soon as the server is listening
         * and reports database trouble in its body instead.
         */
        url: `${BASE_URL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...(E2E_DATABASE_URL ? { DATABASE_URL: E2E_DATABASE_URL } : {}),
          AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-signing-key-0123456789abcdef0123456789",
          // No test may send a real email.
          EMAIL_BACKEND: "console",
          /**
           * A placeholder, not a real credential.
           *
           * The server runs with NODE_ENV=production so the suite exercises a
           * production build, which means `assertProductionConfig` applies and
           * correctly reports a missing Blob token as a degraded configuration.
           * Photo upload is not exercised here — it needs a real store — so a
           * placeholder is what lets the health assertion mean "a fully
           * configured deployment reports healthy".
           */
          BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_E2EPLACEHOLDER_notarealtoken",
          NEXT_PUBLIC_SITE_URL: BASE_URL,
          NODE_ENV: "production",
        },
      },
});
