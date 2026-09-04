/**
 * Resolving the caller's identity, and the guards that act on it.
 *
 * `getCurrentUser` is wrapped in React's `cache`, which memoises it for the
 * lifetime of a single request. A page that checks the current user in its
 * layout, again in the page body and again in three components therefore issues
 * one query, not five — and every one of those call sites can just ask, instead
 * of threading a user object down through props.
 *
 * The access token is stateless, so identity could in principle be read from
 * its claims with no query at all. It is not, for one reason: a ban has to take
 * effect now, not in up to fifteen minutes when the token happens to expire.
 * The row is loaded so `isBanned` and the current role are always the live
 * values. On a platform where a ban is a moderation action against someone
 * abusing missing-person cases, a quarter of an hour of continued access is not
 * an acceptable window.
 */
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";

import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { forbidden, unauthorized } from "@/server/http/errors";

import { ACCESS_COOKIE } from "./session";
import { verifyToken } from "./tokens";

/** The caller, as the rest of the application needs to know them. */
export interface CurrentUser {
  id: string;
  email: string;
  fullName: string | null;
  role: "user" | "admin";
  isEmailVerified: boolean;
  createdAt: Date;
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifyToken(token, "access");
  if (!claims) return null;

  const [row] = await getDb()
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      emailVerifiedAt: users.emailVerifiedAt,
      isBanned: users.isBanned,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, claims.sub))
    .limit(1);

  // A token for a deleted account, or for a banned one, is no identity at all.
  if (!row || row.isBanned) return null;

  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    role: row.role,
    isEmailVerified: row.emailVerifiedAt !== null,
    createdAt: row.createdAt,
  };
});

/** The caller, or a 401. Use wherever an anonymous request makes no sense. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

/**
 * The caller, or a 401/403, and only if they are an administrator.
 *
 * Every privileged route calls this. It is intentionally the only way to
 * establish administrator status server-side: there is no "isAdmin" flag passed
 * from the client to be trusted, and no route that infers privilege from
 * anything but the stored role on the live row.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") {
    // Deliberately a 403 and not a 404. Hiding the route's existence buys
    // nothing here — the console is linked from the navigation for
    // administrators and its paths are not secret — while a clear 403 is what
    // lets an operator diagnose "why can my colleague not see this".
    throw forbidden("This area is restricted to Locora reviewers.");
  }
  return user;
}

/**
 * The caller, or a 403 if they have not verified their email address.
 *
 * An unverified address costs nothing to create, so without this one script can
 * fill the moderation queue with fabricated cases faster than a person can
 * clear them. Reviewers are exempt: they may need to file on someone's behalf
 * from a phone call or a walk-in.
 */
export async function requireVerifiedUser(): Promise<CurrentUser> {
  const { env } = await import("@/server/config/env");
  const user = await requireUser();

  if (user.role === "admin" || !env.requireVerifiedEmailToReport) return user;

  if (!user.isEmailVerified) {
    throw forbidden(
      "Please confirm your email address before filing a report. " +
        "Check your inbox for the link we sent you.",
    );
  }
  return user;
}
