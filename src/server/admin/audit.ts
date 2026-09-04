/**
 * The audit trail.
 *
 * Every privileged action writes a row: who acted, what they did, on what, and
 * a snapshot of the change. On a platform holding missing-person data an
 * unaccountable moderator action is not acceptable, so this is a product
 * requirement rather than optional instrumentation — a reviewer can hide a
 * case, unhide it, link two families' reports together or ban an account, and
 * each of those needs to be answerable for afterwards.
 *
 * ## The metadata is not free-form
 *
 * `metadata` is a JSONB column and it would be easy to drop a whole row into
 * it. That would make the audit trail a second, uncontrolled copy of the
 * sensitive data it is auditing — one that no projection redacts and that is
 * kept deliberately forever. So the metadata written here is limited to state
 * transitions and identifiers, and `sanitiseMetadata` strips anything that
 * looks like personal data before it is stored, in the same spirit as the
 * logger.
 *
 * ## Writing must not fail the action
 *
 * A failed audit write is logged rather than thrown. The alternative is that a
 * transient database problem in the audit table blocks a reviewer from
 * rejecting an abusive report — which trades a gap in the record for the
 * abusive content staying up. The gap is the lesser harm, and it is visible in
 * the logs.
 */
import { desc, eq, sql } from "drizzle-orm";

import { type Database, getDb } from "@/db/client";
import { auditLogs, users } from "@/db/schema";
import type { CurrentUser } from "@/server/auth/current-user";
import { logger } from "@/server/observability/logger";

/**
 * The vocabulary of auditable actions.
 *
 * A closed union rather than a free string, so the log can be filtered and
 * counted reliably, and so a typo becomes a type error instead of an
 * unqueryable row.
 */
export type AuditAction =
  | "report.status_changed"
  | "report.photos_removed"
  | "match.created"
  | "match.confirmed"
  | "match.dismissed"
  | "abuse_report.resolved"
  | "user.banned"
  | "user.unbanned"
  | "user.role_changed";

export type AuditTargetType = "missing_report" | "found_report" | "match" | "abuse_report" | "user";

/** Keys that must never reach the audit table, matched as substrings. */
const FORBIDDEN_METADATA_KEYS = [
  "name",
  "email",
  "phone",
  "contact",
  "address",
  "whereabouts",
  "latitude",
  "longitude",
  "password",
  "token",
  "notes",
  "details",
];

export type AuditMetadata = Record<string, string | number | boolean | null>;

function sanitiseMetadata(metadata: AuditMetadata | undefined): AuditMetadata | null {
  if (!metadata) return null;

  const output: AuditMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.some((forbidden) => key.toLowerCase().includes(forbidden))) {
      continue;
    }
    output[key] = typeof value === "string" ? value.slice(0, 200) : value;
  }
  return Object.keys(output).length > 0 ? output : null;
}

export interface RecordAuditInput {
  actor: CurrentUser;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  metadata?: AuditMetadata;
}

/**
 * Appends to the audit trail.
 *
 * Accepts a `Database` so it can join the transaction that performed the
 * action, keeping the record and the change atomic where the caller wants that.
 */
export async function recordAudit(db: Database, input: RecordAuditInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorId: input.actor.id,
      // Denormalised deliberately: the foreign key is ON DELETE SET NULL so the
      // trail outlives the account, and without this copy an entry would then
      // no longer say who acted.
      actorEmail: input.actor.email,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: sanitiseMetadata(input.metadata),
    });
  } catch (error) {
    logger.error("Audit write failed", {
      action: input.action,
      targetType: input.targetType,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export interface AuditEntryView {
  id: string;
  actorEmail: string | null;
  actorName: string | null;
  action: AuditAction | string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * The trail, newest first.
 *
 * Reviewer-only, enforced at the route. The actor's email address is shown
 * here — that is the point of an audit log, and everyone who can read it is
 * already trusted with far more sensitive data than a colleague's work address.
 */
export async function listAuditEntries(
  options: { limit?: number; offset?: number } = {},
): Promise<{ items: AuditEntryView[]; total: number }> {
  const limit = Math.min(options.limit ?? 50, 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const db = getDb();

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        actorEmail: auditLogs.actorEmail,
        actorName: users.fullName,
        action: auditLogs.action,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorId, users.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(auditLogs),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      actorEmail: row.actorEmail,
      actorName: row.actorName,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    total: countRow?.count ?? 0,
  };
}
