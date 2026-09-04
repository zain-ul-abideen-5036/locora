/**
 * Loads .env files for code that runs *outside* Next.js.
 *
 * The Next.js runtime reads `.env.local` and friends by itself, so application
 * code must never call this. Standalone entry points — the migration script,
 * the seed script, drizzle-kit — get no such treatment and would otherwise see
 * an empty `process.env`.
 *
 * Files are loaded in Next.js's own precedence order, and `override: false`
 * means a variable already present in the real environment always wins. That
 * matters in CI and on Vercel, where the platform supplies the values and a
 * stray committed `.env` must not be able to shadow them.
 */
import { config } from "dotenv";

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  loaded = true;

  for (const path of [".env.local", ".env"]) {
    config({ path, override: false, quiet: true });
  }
}
