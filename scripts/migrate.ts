/**
 * Applies pending migrations, then reconciles the bootstrap admin.
 *
 * This runs as the first half of `npm run build`, which means it runs on Vercel
 * as part of every deploy. That is deliberate. The alternative is a human
 * remembering to run migrations against production from a laptop, in the right
 * order, against the right branch — a step that gets skipped exactly once and
 * then takes the site down with a column that does not exist.
 *
 * Three properties make it safe to have in the build:
 *
 * - Drizzle's migrator records what it has applied and takes an advisory lock,
 *   so concurrent deploys cannot apply the same migration twice.
 * - Every migration in `drizzle/` is additive. Nothing here drops a column or a
 *   table; a destructive change would need a reviewed, explicitly staged
 *   migration and is not something a build should do on its own.
 * - With no DATABASE_URL it exits cleanly rather than failing, so a contributor
 *   can `npm run build` to check the app compiles without provisioning a
 *   database first. In production that path is unreachable —
 *   `assertProductionConfig` refuses a deploy with no DATABASE_URL before this
 *   check is reached.
 */
import { loadEnv } from "../src/server/config/load-env";

loadEnv();

async function main(): Promise<void> {
  const { env, assertProductionConfig } = await import("../src/server/config/env");

  // Runs first, so a production deploy missing a signing key or a Blob token
  // fails here — at build time, with a list of what is missing — instead of
  // succeeding and then failing per-request in front of users.
  assertProductionConfig();

  if (!env.databaseUrl) {
    console.log(
      "[migrate] DATABASE_URL is not set — skipping migrations.\n" +
        "          This is expected for a build that only checks compilation.",
    );
    return;
  }

  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { getDb, closeDb } = await import("../src/db/client");
  const { reconcileBootstrapAdmin } = await import("../src/server/auth/bootstrap-admin");

  const db = getDb();

  try {
    const startedAt = Date.now();
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log(`[migrate] schema up to date (${Date.now() - startedAt}ms)`);

    const outcome = await reconcileBootstrapAdmin(db);
    console.log(`[migrate] bootstrap admin: ${outcome}`);
  } finally {
    await closeDb();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[migrate] failed\n${message}`);
  process.exit(1);
});
