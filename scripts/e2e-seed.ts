/**
 * Prepares the database the end-to-end run works against.
 *
 * Runs as its own step before Playwright starts, rather than as a `globalSetup`
 * hook, because Playwright launches the web server *before* global setup — and
 * this server queries the database on its first request, so it would boot
 * against an empty schema and never report ready.
 *
 * Migrates, empties, then seeds exactly the fixtures the specs reference: a
 * reporter, a reviewer, a published case, a case still in the queue, and a
 * published found-person case. The queued one exists so the suite can assert
 * through a real browser that an unreviewed case is not reachable.
 *
 * Everything is written through the real schema and the real password hasher,
 * so nothing here can create a row the application could not.
 */
import { sql } from "drizzle-orm";

import { loadEnv } from "../src/server/config/load-env";
import {
  E2E_FOUND_CASE,
  E2E_PENDING_CASE,
  E2E_PUBLISHED_CASE,
  E2E_REPORTER,
  E2E_REVIEWER,
} from "../tests/e2e/fixtures";

loadEnv();

async function main(): Promise<void> {
  const databaseUrl = process.env.E2E_DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      "E2E_DATABASE_URL is not set, so the end-to-end suite has no database.\n" +
        "  Point it at a database you do not mind being emptied, for example:\n" +
        "  E2E_DATABASE_URL=postgres://user:pass@localhost:5432/locora_e2e npm run test:e2e\n" +
        "  It is a separate variable from DATABASE_URL so a stray run cannot\n" +
        "  erase development data.",
    );
  }

  // Set before the database client is imported, since it reads the URL once at
  // construction.
  process.env.DATABASE_URL = databaseUrl;

  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { getDb, closeDb } = await import("../src/db/client");
  const { users, missingPersonReports, foundPersonReports } = await import("../src/db/schema");
  const { hashPassword } = await import("../src/server/auth/password");

  const db = getDb();

  try {
    await migrate(db, { migrationsFolder: "./drizzle" });

    await db.execute(sql`
      TRUNCATE TABLE
        audit_logs, notifications, abuse_reports, matches, report_photos,
        missing_person_reports, found_person_reports, verification_tokens,
        refresh_tokens, rate_limits, users
      RESTART IDENTITY CASCADE
    `);

    const passwordHash = await hashPassword(E2E_REPORTER.password);

    const [reporter] = await db
      .insert(users)
      .values({
        email: E2E_REPORTER.email,
        passwordHash,
        fullName: E2E_REPORTER.fullName,
        role: "user",
        // Confirmed, so a spec can reach the filing form without an inbox. The
        // unconfirmed path is covered by the integration suite instead.
        emailVerifiedAt: new Date(),
      })
      .returning({ id: users.id });

    if (!reporter) throw new Error("seed: reporter insert returned no row");

    await db.insert(users).values({
      email: E2E_REVIEWER.email,
      passwordHash,
      fullName: E2E_REVIEWER.fullName,
      role: "admin",
      emailVerifiedAt: new Date(),
    });

    await db.insert(missingPersonReports).values({
      reporterId: reporter.id,
      fullName: E2E_PUBLISHED_CASE.fullName,
      age: 12,
      gender: "female",
      heightCm: 140,
      clothingDescription: "Navy school uniform with a red backpack",
      lastSeenAddress: "Near Liberty Market",
      lastSeenCity: E2E_PUBLISHED_CASE.city,
      lastSeenLatitude: 31.5204,
      lastSeenLongitude: 74.3587,
      lastSeenAt: new Date("2026-08-01T14:30:00Z"),
      contactName: E2E_PUBLISHED_CASE.contactName,
      contactPhone: E2E_PUBLISHED_CASE.contactPhone,
      contactEmail: E2E_PUBLISHED_CASE.contactEmail,
      policeReportNumber: E2E_PUBLISHED_CASE.policeReportNumber,
      status: "published",
    });

    await db.insert(missingPersonReports).values({
      reporterId: reporter.id,
      fullName: E2E_PENDING_CASE.fullName,
      age: 30,
      gender: "male",
      lastSeenAddress: "Somewhere in the old city",
      lastSeenCity: "Karachi",
      lastSeenAt: new Date("2026-08-10T10:00:00Z"),
      contactName: "Private Contact",
      contactPhone: "+92 300 5550202",
      status: "pending",
    });

    await db.insert(foundPersonReports).values({
      reporterId: reporter.id,
      estimatedAgeMin: 10,
      estimatedAgeMax: 15,
      gender: "female",
      notes: "Found alone at the terminal, unable to say where she lives",
      foundAddress: "Cantt bus terminal",
      foundCity: E2E_FOUND_CASE.city,
      foundAt: new Date("2026-08-03T08:00:00Z"),
      currentWhereabouts: E2E_FOUND_CASE.currentWhereabouts,
      contactName: "Sara Ahmed",
      contactPhone: E2E_FOUND_CASE.contactPhone,
      status: "published",
    });

    console.log("[e2e-seed] database migrated and seeded");
  } finally {
    // Otherwise the pool keeps this process alive and the npm chain never
    // reaches Playwright.
    await closeDb();
  }
}

main().catch((error: unknown) => {
  console.error(`[e2e-seed] failed\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
