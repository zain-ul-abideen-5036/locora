/**
 * In-app notifications.
 *
 * One entry point, `notify`, which every other module calls. The durable row is
 * the product: it is what the bell in the header counts and what the
 * notifications page lists, and it survives whether or not an email ever left
 * the building. Email is a separate, best-effort delivery on top (see
 * src/server/email/mailer.ts) and its failure never fails the action that
 * raised the notification.
 *
 * ## Not sending too many
 *
 * The brief for this product is "do not create notification spam", and that is
 * a functional requirement rather than a nicety. Somebody whose child is
 * missing will have Locora's notifications switched on and will read every one.
 * If three of the first four are procedural noise, the fourth — a possible
 * match — is the one they will scroll past. So the set of events that notify is
 * deliberately small (see `shouldNotifyReporter` in ../reports/status.ts), and
 * internal review steps are silent.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { type Database, getDb } from "@/db/client";
import type { NotificationType } from "@/db/enums";
import { notifications } from "@/db/schema";
import { notFound } from "@/server/http/errors";

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** A path within the application, never an absolute URL — see the guard below. */
  href?: string | null;
}

/**
 * Writes a notification.
 *
 * Takes a `Database` rather than reaching for the singleton so a caller inside
 * a transaction can pass the transaction handle. That is what makes "create the
 * match and queue both notifications" atomic: a match that exists while the
 * families were never told about it is worse than no match at all.
 */
export async function notify(db: Database, input: NotifyInput): Promise<void> {
  await db.insert(notifications).values({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    href: safeHref(input.href),
  });
}

/**
 * Rejects anything that is not a same-site path.
 *
 * `href` is rendered as a link the recipient is likely to trust, since it
 * arrived from Locora. An absolute URL here would be an open redirect wearing
 * the platform's credibility — and this value is assembled in server code
 * today, which is exactly when a guard is cheap to add and easy to forget.
 */
function safeHref(href: string | null | undefined): string | null {
  if (!href) return null;
  // Must start with a single slash: `//evil.example` is protocol-relative and
  // leaves the site.
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  return href;
}

export async function listForUser(
  userId: string,
  options: { unreadOnly?: boolean; limit?: number } = {},
): Promise<NotificationView[]> {
  const limit = Math.min(options.limit ?? 50, 100);

  const rows = await getDb()
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      href: notifications.href,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(
      options.unreadOnly
        ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
        : eq(notifications.userId, userId),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: row.href,
    isRead: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function countUnread(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.count ?? 0;
}

/**
 * Marks one notification read.
 *
 * The user id is part of the WHERE clause, not checked after the fact. That is
 * the difference between an authorisation check and an authorisation bug: with
 * the id in the predicate, a request naming somebody else's notification
 * updates nothing and reports not-found, and there is no code path where the
 * row is loaded first and the ownership test could be skipped.
 */
export async function markRead(userId: string, notificationId: string): Promise<void> {
  const updated = await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });

  if (updated.length === 0) throw notFound("That notification could not be found.");
}

export async function markAllRead(userId: string): Promise<number> {
  const updated = await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return updated.length;
}
