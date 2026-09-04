/**
 * Database access.
 *
 * One `pg` pool, one Drizzle instance, both cached on the module. On Vercel a
 * module lives for the lifetime of a warm instance, so this amounts to one pool
 * per instance rather than one per request — which is the difference between
 * paying TCP + TLS + auth setup once and paying it on every call.
 *
 * ## Why `pg` and not Neon's HTTP driver
 *
 * Neon's serverless driver is faster on a single statement, but it cannot hold
 * an interactive transaction, and several operations here genuinely need one:
 * rotating a refresh token, and creating a match (which writes the link, moves
 * two reports and queues two notifications, all of which must land together or
 * not at all). `pg` also speaks to any Postgres, which means local development,
 * CI and the integration suite all run against the same driver as production
 * instead of a stand-in.
 *
 * ## Why the pooled endpoint matters
 *
 * `DATABASE_URL` must point at Neon's *pooled* host — the one with `-pooler` in
 * it. That endpoint is PgBouncer in transaction mode, which is what makes a
 * serverless caller safe: connections are handed back between statements
 * instead of being held. Two consequences are handled here. The pool is kept
 * small, because a hundred warm instances each holding ten connections will
 * exhaust the upstream limit. And nothing is ever issued as a named prepared
 * statement — Drizzle only does that for an explicitly `.prepare()`d query, and
 * none exist, because in transaction pooling the next statement can land on a
 * different backend that has never seen the handle. That failure appears only
 * under load, never in testing.
 */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import { env } from "@/server/config/env";

import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

let pool: Pool | undefined;
let database: Database | undefined;

/**
 * Whether this connection string needs TLS.
 *
 * A local Postgres almost never offers it, and every managed provider requires
 * it. Getting this wrong produces one of two confusing errors — "server does
 * not support SSL" or "connection is insecure" — so it is decided from the URL
 * rather than left to a separate variable someone has to remember to flip.
 */
function resolveSsl(connectionString: string): PoolConfig["ssl"] {
  let host = "";
  let sslMode: string | null = null;
  try {
    const url = new URL(connectionString);
    host = url.hostname;
    sslMode = url.searchParams.get("sslmode");
  } catch {
    // A connection string `pg` can parse but `URL` cannot; fall through to the
    // conservative default below.
  }

  if (sslMode === "disable") return false;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    // `sslmode=require` against a local server is a deliberate choice, so honour it.
    return sslMode === "require" || sslMode === "verify-full" ? { rejectUnauthorized: false } : false;
  }
  // Managed Postgres presents a certificate from a public CA. Verifying it is
  // the point of using TLS at all, so this is never relaxed for a remote host.
  return { rejectUnauthorized: true };
}

function connectionString(): string {
  if (!env.databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set, so there is no database to talk to.\n" +
        "  Local development: copy .env.example to .env.local and paste a Neon connection string.\n" +
        "  Vercel: add DATABASE_URL to the project's environment variables.\n" +
        "  Use the pooled endpoint — the host containing `-pooler`.",
    );
  }
  return env.databaseUrl;
}

export function getPool(): Pool {
  if (!pool) {
    const url = connectionString();
    pool = new Pool({
      connectionString: url,
      ssl: resolveSsl(url),
      // Small on purpose: see the note on the pooled endpoint above. Concurrency
      // comes from Vercel running more instances, not from one instance holding
      // more connections.
      max: 5,
      // Return a connection to PgBouncer quickly once an instance goes quiet,
      // rather than holding it for the whole life of a warm instance.
      idleTimeoutMillis: 10_000,
      // Fail a cold start with a clear error instead of hanging until the
      // platform's own timeout kills the invocation with no explanation.
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
    });

    // An idle client erroring (a network blip, the pooler recycling a backend)
    // emits on the pool. Without a listener, Node treats it as an unhandled
    // error event and takes the process down — killing an instance that was
    // serving other requests perfectly well.
    pool.on("error", (error) => {
      console.error("[db] idle client error", { message: error.message });
    });
  }
  return pool;
}

export function getDb(): Database {
  if (!database) {
    database = drizzle(getPool(), { schema, casing: "snake_case" });
  }
  return database;
}

/**
 * Closes the pool. For scripts and the test suite, which must exit rather than
 * wait on an open socket. Request handlers never call this.
 */
export async function closeDb(): Promise<void> {
  const current = pool;
  pool = undefined;
  database = undefined;
  if (current) await current.end();
}

export { schema };
