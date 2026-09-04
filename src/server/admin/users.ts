/**
 * Account moderation: listing users, suspending them, and granting review
 * access.
 *
 * The guard rails here exist because the failure modes are unrecoverable
 * without database access. An administrator who bans themselves, or demotes the
 * last administrator, locks the whole console — and there is no in-product way
 * back from that.
 */
import { and, desc, eq, ne, or, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import type { UserRole } from "@/db/enums";
import { foundPersonReports, missingPersonReports, users } from "@/db/schema";
import { recordAudit } from "@/server/admin/audit";
import type { CurrentUser } from "@/server/auth/current-user";
import { revokeAllSessions } from "@/server/auth/session";
import { badRequest, conflict, notFound } from "@/server/http/errors";
import { notify } from "@/server/notifications/service";
import { logger } from "@/server/observability/logger";

export interface AdminUserView {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  isEmailVerified: boolean;
  isBanned: boolean;
  bannedReason: string | null;
  reportCount: number;
  createdAt: string;
}

/**
 * Accounts, newest first, with each one's report count.
 *
 * The counts come from correlated subqueries in the same statement rather than
 * a query per row. A hundred users listed with a per-user count is a hundred
 * extra round trips, each crossing a network from a serverless function.
 */
export async function listUsers(options: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: AdminUserView[]; total: number }> {
  const db = getDb();
  const limit = Math.min(options.limit ?? 50, 100);
  const offset = Math.max(options.offset ?? 0, 0);

  const search = options.search?.trim();
  const where = search
    ? or(
        sql`lower(${users.email}) LIKE lower(${`%${search}%`})`,
        sql`lower(coalesce(${users.fullName}, '')) LIKE lower(${`%${search}%`})`,
      )
    : undefined;

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        emailVerifiedAt: users.emailVerifiedAt,
        isBanned: users.isBanned,
        bannedReason: users.bannedReason,
        createdAt: users.createdAt,
        reportCount: sql<number>`(
          (SELECT count(*) FROM ${missingPersonReports} WHERE ${missingPersonReports.reporterId} = ${users.id})
          + (SELECT count(*) FROM ${foundPersonReports} WHERE ${foundPersonReports.reporterId} = ${users.id})
        )::int`,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(users).where(where),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      role: row.role,
      isEmailVerified: row.emailVerifiedAt !== null,
      isBanned: row.isBanned,
      bannedReason: row.bannedReason,
      reportCount: row.reportCount,
      createdAt: row.createdAt.toISOString(),
    })),
    total: countRow?.count ?? 0,
  };
}

/**
 * Suspends or restores an account.
 *
 * Suspending revokes every session immediately, so the ban takes effect on the
 * next request rather than whenever an access token happens to expire.
 *
 * Existing reports are left alone. A suspended reporter's published case may
 * still be about a real missing person, and taking it down automatically would
 * punish the subject of the report for the behaviour of whoever filed it. A
 * reviewer decides each case on its own merits.
 */
export async function setBanned(
  reviewer: CurrentUser,
  targetUserId: string,
  isBanned: boolean,
  reason: string | null,
): Promise<AdminUserView> {
  if (targetUserId === reviewer.id) {
    throw badRequest(
      isBanned
        ? "You cannot suspend your own account."
        : "Your own account is not suspended.",
    );
  }

  const db = getDb();

  const [target] = await db
    .select({ id: users.id, role: users.role, isBanned: users.isBanned })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  if (!target) throw notFound("That account could not be found.");
  if (target.isBanned === isBanned) {
    throw conflict(isBanned ? "That account is already suspended." : "That account is not suspended.");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ isBanned, bannedReason: isBanned ? reason : null, updatedAt: new Date() })
      .where(eq(users.id, targetUserId));

    if (isBanned) {
      await revokeAllSessions(tx, targetUserId);
    } else {
      // Told on restoration, not on suspension. A suspended account cannot sign
      // in to read a notification, so writing one would be pointless — and the
      // ban reason belongs in a message from a person, not an automated feed
      // item.
      await notify(tx, {
        userId: targetUserId,
        type: "account_security",
        title: "Your account has been restored",
        body: "You can sign in and file reports again.",
        href: "/dashboard",
      });
    }

    await recordAudit(tx, {
      actor: reviewer,
      action: isBanned ? "user.banned" : "user.unbanned",
      targetType: "user",
      targetId: targetUserId,
    });
  });

  logger.info("Account moderation applied", { targetUserId, isBanned });

  const view = await findUser(targetUserId);
  if (!view) throw notFound("That account could not be found.");
  return view;
}

/**
 * Grants or removes review access.
 *
 * Refuses to remove the last administrator. Without that check, one careless
 * click leaves an instance with no way to review a report and no way to grant
 * anybody the ability to — recoverable only by setting INITIAL_ADMIN_EMAIL and
 * redeploying, which is not a thing to discover during an incident.
 */
export async function setRole(
  reviewer: CurrentUser,
  targetUserId: string,
  role: UserRole,
): Promise<AdminUserView> {
  const db = getDb();

  const [target] = await db
    .select({ id: users.id, role: users.role, isBanned: users.isBanned })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  if (!target) throw notFound("That account could not be found.");
  if (target.role === role) {
    throw conflict(
      role === "admin" ? "That account already has review access." : "That account has no review access.",
    );
  }

  if (role === "user" && target.role === "admin") {
    const [remaining] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.role, "admin"), ne(users.id, targetUserId), eq(users.isBanned, false)));

    if ((remaining?.count ?? 0) === 0) {
      throw conflict(
        "This is the only active reviewer account. Grant review access to somebody else first.",
      );
    }
  }

  if (role === "admin" && target.isBanned) {
    throw badRequest("Restore this account before granting review access.");
  }

  await db.transaction(async (tx) => {
    await tx.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, targetUserId));

    await notify(tx, {
      userId: targetUserId,
      type: "account_security",
      title: role === "admin" ? "You now have reviewer access" : "Your reviewer access was removed",
      body:
        role === "admin"
          ? "You can review reports and confirm matches from the review console."
          : "You no longer have access to the review console.",
      href: role === "admin" ? "/review" : "/dashboard",
    });

    await recordAudit(tx, {
      actor: reviewer,
      action: "user.role_changed",
      targetType: "user",
      targetId: targetUserId,
      metadata: { from: target.role, to: role },
    });
  });

  logger.info("Account role changed", { targetUserId, role });

  const view = await findUser(targetUserId);
  if (!view) throw notFound("That account could not be found.");
  return view;
}

/** One account in the same shape the list returns, so a mutation can echo the new state back. */
export async function findUser(userId: string): Promise<AdminUserView | null> {
  const [row] = await getDb()
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      emailVerifiedAt: users.emailVerifiedAt,
      isBanned: users.isBanned,
      bannedReason: users.bannedReason,
      createdAt: users.createdAt,
      reportCount: sql<number>`(
        (SELECT count(*) FROM ${missingPersonReports} WHERE ${missingPersonReports.reporterId} = ${users.id})
        + (SELECT count(*) FROM ${foundPersonReports} WHERE ${foundPersonReports.reporterId} = ${users.id})
      )::int`,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    role: row.role,
    isEmailVerified: row.emailVerifiedAt !== null,
    isBanned: row.isBanned,
    bannedReason: row.bannedReason,
    reportCount: row.reportCount,
    createdAt: row.createdAt.toISOString(),
  };
}
