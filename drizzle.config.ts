import { defineConfig } from "drizzle-kit";
import { loadEnv } from "./src/server/config/load-env";

loadEnv();

/**
 * Drizzle Kit generates SQL migration files from `src/db/schema.ts` into
 * `drizzle/`. Those files are committed and are the only thing that ever runs
 * against a database — the schema module is the source the generator reads, not
 * something applied directly. `drizzle-kit push` is deliberately not wired up
 * as a script: it diffs and mutates a live database with no reviewable
 * artefact, which is the wrong tool for a production schema.
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
