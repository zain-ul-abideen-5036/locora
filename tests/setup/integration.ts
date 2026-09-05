import { beforeAll, beforeEach, afterAll, vi } from "vitest";

import { loadEnv } from "../../src/server/config/load-env";

/**
 * Setup for the integration project.
 *
 * These tests run the real service layer against a real PostgreSQL database.
 * Nothing is stubbed except the two things that cannot exist outside a request:
 * Next's cookie store and its cache wrapper.
 *
 * ## The database must be named explicitly
 *
 * `TEST_DATABASE_URL`, never `DATABASE_URL`. This suite truncates every table
 * before each test, and silently falling back to whatever `DATABASE_URL`
 * happens to point at is how somebody's development data — or worse — gets
 * erased by running the tests. Requiring a separate variable makes that
 * impossible by accident.
 *
 * With it unset the suite skips with instructions rather than failing, so
 * `npm test` stays useful to a contributor who has not provisioned a database.
 */

loadEnv();

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
export const hasTestDatabase = Boolean(TEST_DATABASE_URL);

/**
 * Applied at module scope, not in `beforeAll`.
 *
 * `src/server/config/env.ts` snapshots `process.env` once, at import. Vitest
 * evaluates a setup file before it imports the test file, so this is the last
 * moment the values can be changed before the configuration module reads them —
 * doing it in `beforeAll` is too late, and fails with "DATABASE_URL is not set"
 * despite the variable being present.
 */
if (TEST_DATABASE_URL) {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.AUTH_SECRET ??= "integration-test-signing-key-0123456789abcdef";
  // Pinned to the console backend so no test can send a real email.
  process.env.EMAIL_BACKEND = "console";
  // Kept on, so the report-filing guard is exercised rather than bypassed.
  process.env.REQUIRE_VERIFIED_EMAIL_TO_REPORT = "true";
}

/**
 * An in-memory cookie jar standing in for Next's request-scoped store.
 *
 * The session functions read and write cookies through `next/headers`, which
 * throws outside a request. Rather than avoid testing them — session rotation
 * and reuse detection are among the most important behaviours here — the module
 * is mocked with something that behaves like a jar, so the real
 * `issueSession` / `rotateSession` code runs unchanged.
 */
const cookieStore = new Map<string, string>();

export const testCookies = {
  get(name: string): string | undefined {
    return cookieStore.get(name);
  },
  set(name: string, value: string): void {
    cookieStore.set(name, value);
  },
  clear(): void {
    cookieStore.clear();
  },
};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      // Mirrors the real store: an empty value with maxAge 0 is how the
      // application clears a cookie, and the jar has to reflect that or a
      // sign-out test would still see the old token.
      if (value === "") cookieStore.delete(name);
      else cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
    getAll: () => [...cookieStore.entries()].map(([name, value]) => ({ name, value })),
  }),
}));

/**
 * React's `cache` is a no-op here.
 *
 * `getCurrentUser` is wrapped in it to memoise per request. Outside a request
 * React has no cache scope, and — more importantly for a test — memoising would
 * mean a second call after a role change still returned the old user.
 */
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T) => fn };
});

beforeAll(async () => {
  if (!hasTestDatabase) return;

  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { getDb } = await import("../../src/db/client");

  await migrate(getDb(), { migrationsFolder: "./drizzle" });
}, 60_000);

/**
 * A clean database before every test.
 *
 * One `TRUNCATE` naming every table, with `CASCADE` for the foreign keys and
 * `RESTART IDENTITY` for completeness. Truncating is used rather than a
 * transaction-per-test that rolls back, because the code under test uses its
 * own transactions and nesting them would change the behaviour being tested —
 * a rollback in an inner transaction is not a rollback.
 */
beforeEach(async () => {
  if (!hasTestDatabase) return;

  testCookies.clear();

  const { getDb } = await import("../../src/db/client");
  const { sql } = await import("drizzle-orm");

  await getDb().execute(sql`
    TRUNCATE TABLE
      audit_logs,
      notifications,
      abuse_reports,
      matches,
      report_photos,
      missing_person_reports,
      found_person_reports,
      verification_tokens,
      refresh_tokens,
      rate_limits,
      users
    RESTART IDENTITY CASCADE
  `);
});

afterAll(async () => {
  if (!hasTestDatabase) return;
  const { closeDb } = await import("../../src/db/client");
  // Otherwise the pool keeps the process alive after the last test.
  await closeDb();
});
