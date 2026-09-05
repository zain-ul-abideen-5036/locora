import { eq, sql } from "drizzle-orm";
import { describe } from "vitest";

import { getDb } from "@/db/client";
import { foundPersonReports, missingPersonReports, users } from "@/db/schema";
import type { CurrentUser } from "@/server/auth/current-user";
import { hashPassword } from "@/server/auth/password";

import { hasTestDatabase } from "../setup/integration";

/**
 * Test data builders.
 *
 * Every factory writes through the real schema, so a constraint that would
 * reject production data rejects a fixture too. Fixtures that bypassed the
 * schema would let a test pass against data the application could never
 * actually hold.
 */

/**
 * `describe`, unless there is no test database — in which case the block is
 * skipped with the reason visible in the run output rather than failing.
 */
export const describeDb: typeof describe = hasTestDatabase
  ? describe
  : describe.skip.bind(describe) as typeof describe;

if (!hasTestDatabase) {
  console.warn(
    "\n[integration] TEST_DATABASE_URL is not set — integration tests are skipped.\n" +
      "  Point it at a database you do not mind being truncated, e.g.\n" +
      "  TEST_DATABASE_URL=postgres://user:pass@localhost:5432/locora_test\n",
  );
}

export const TEST_PASSWORD = "IntegrationTest1";

let sequence = 0;

/** A unique address per call, so tests never collide on the unique index. */
export function uniqueEmail(prefix = "user"): string {
  sequence += 1;
  return `${prefix}-${sequence}-${Date.now()}@locora.test`;
}

export interface CreatedUser extends CurrentUser {
  passwordHash: string;
}

export async function createUser(
  options: {
    email?: string;
    role?: "user" | "admin";
    verified?: boolean;
    banned?: boolean;
    fullName?: string;
    password?: string;
  } = {},
): Promise<CreatedUser> {
  const email = options.email ?? uniqueEmail(options.role === "admin" ? "reviewer" : "user");
  const passwordHash = await hashPassword(options.password ?? TEST_PASSWORD);
  const verifiedAt = options.verified === false ? null : new Date();

  const [row] = await getDb()
    .insert(users)
    .values({
      email,
      passwordHash,
      fullName: options.fullName ?? "Test Person",
      role: options.role ?? "user",
      emailVerifiedAt: verifiedAt,
      isBanned: options.banned ?? false,
    })
    .returning();

  if (!row) throw new Error("createUser: insert returned no row");

  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    role: row.role,
    isEmailVerified: row.emailVerifiedAt !== null,
    createdAt: row.createdAt,
    passwordHash: row.passwordHash,
  };
}

export async function createMissingReport(
  reporterId: string,
  overrides: Partial<typeof missingPersonReports.$inferInsert> = {},
): Promise<{ id: string }> {
  const [row] = await getDb()
    .insert(missingPersonReports)
    .values({
      reporterId,
      fullName: "Aisha Khan",
      age: 12,
      gender: "female",
      heightCm: 140,
      clothingDescription: "Navy school uniform",
      lastSeenAddress: "Near Liberty Market",
      lastSeenCity: "Lahore",
      lastSeenAt: new Date("2026-08-01T14:30:00Z"),
      contactName: "Farah Siddiqui",
      contactPhone: "+92 300 1234567",
      contactEmail: "farah@example.test",
      policeReportNumber: "FIR-2026-1",
      status: "pending",
      ...overrides,
    })
    .returning({ id: missingPersonReports.id });

  if (!row) throw new Error("createMissingReport: insert returned no row");
  return row;
}

export async function createFoundReport(
  reporterId: string,
  overrides: Partial<typeof foundPersonReports.$inferInsert> = {},
): Promise<{ id: string }> {
  const [row] = await getDb()
    .insert(foundPersonReports)
    .values({
      reporterId,
      estimatedAgeMin: 10,
      estimatedAgeMax: 15,
      gender: "female",
      heightCm: 138,
      notes: "Found alone at the bus terminal",
      foundAddress: "Cantt bus terminal",
      foundCity: "Lahore",
      foundAt: new Date("2026-08-03T08:00:00Z"),
      currentWhereabouts: "District hospital",
      contactName: "Sara Ahmed",
      contactPhone: "+92 301 9876543",
      status: "pending",
      ...overrides,
    })
    .returning({ id: foundPersonReports.id });

  if (!row) throw new Error("createFoundReport: insert returned no row");
  return row;
}

/** Re-reads a user's role and ban state, for asserting a moderation action landed. */
export async function readUser(userId: string) {
  const [row] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
  return row;
}

export async function countRows(table: string): Promise<number> {
  const result = await getDb().execute<{ count: number }>(
    sql.raw(`SELECT count(*)::int AS count FROM ${table}`),
  );
  return Number(result.rows[0]?.count ?? 0);
}
