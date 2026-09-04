/**
 * Session lifecycle: cookies, rotation, revocation, reuse detection.
 *
 * ## Why cookies and not a header
 *
 * Both tokens are delivered as httpOnly cookies, so no client-side JavaScript
 * can read them — which means an XSS payload cannot exfiltrate a session either.
 * The alternative, a token in `localStorage` with an `Authorization` header, is
 * readable by any script on the page by design.
 *
 * ## Why the refresh cookie has a narrower path
 *
 * The access cookie is scoped to `/` because every request needs it. The
 * refresh cookie is scoped to `/api/auth`, so the browser only attaches the
 * long-lived credential to the two endpoints that have any use for it. It is
 * simply absent from the hundreds of other requests a session makes, which is
 * the cheapest possible reduction in its exposure.
 *
 * ## Rotation and reuse detection
 *
 * Every refresh issues a new refresh token and revokes the one presented. A
 * refresh token is therefore single-use, which bounds what a captured one is
 * worth. If an already-revoked `jti` is presented again, one of two things has
 * happened: a client raced itself, or a token was stolen and replayed. The
 * second is serious enough that both are treated the same way — every session
 * for that account is revoked and the user has to sign in again. See
 * `src/lib/api-client.ts` for the client-side de-duplication that stops a page
 * firing several parallel requests from tripping this on itself.
 */
import { and, eq, isNull, lt } from "drizzle-orm";
import { cookies } from "next/headers";

import { type Database } from "@/db/client";
import { refreshTokens } from "@/db/schema";
import { env } from "@/server/config/env";

import { signAccessToken, signRefreshToken, verifyToken } from "./tokens";

export const ACCESS_COOKIE = "locora_at";
export const REFRESH_COOKIE = "locora_rt";
const REFRESH_COOKIE_PATH = "/api/auth";

interface CookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
}

function cookieOptions(path: string, maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    // The app and its API share one origin, so no request that needs the
    // cookie is cross-site. `lax` is therefore sufficient, and `none` — which a
    // split frontend/API deployment would force — is avoided entirely along
    // with the CSRF exposure it brings.
    sameSite: "lax",
    path,
    maxAge,
  };
}

/** Issues a fresh token pair, records the refresh token, and sets both cookies. */
export async function issueSession(db: Database, userId: string): Promise<void> {
  const access = await signAccessToken(userId);
  const refresh = await signRefreshToken(userId);

  await db.insert(refreshTokens).values({
    userId,
    jti: refresh.jti,
    expiresAt: refresh.expiresAt,
  });

  const jar = await cookies();
  jar.set(ACCESS_COOKIE, access.token, cookieOptions("/", env.accessTokenTtlSeconds));
  jar.set(
    REFRESH_COOKIE,
    refresh.token,
    cookieOptions(REFRESH_COOKIE_PATH, env.refreshTokenTtlSeconds),
  );
}

export async function clearSessionCookies(): Promise<void> {
  const jar = await cookies();
  // Overwritten with an immediately-expiring value rather than deleted, because
  // a delete that does not match the original path and flags silently leaves
  // the cookie in place.
  jar.set(ACCESS_COOKIE, "", cookieOptions("/", 0));
  jar.set(REFRESH_COOKIE, "", cookieOptions(REFRESH_COOKIE_PATH, 0));
}

export type RotationResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "missing" | "invalid" | "revoked" | "reused" | "expired" };

/**
 * Exchanges a refresh token for a new pair.
 *
 * The whole exchange runs in one transaction. Without it, two concurrent
 * refreshes can both read the same un-revoked row, both revoke it and both
 * issue a token — leaving two live sessions where the rotation scheme
 * guarantees one, and no record of which is legitimate.
 */
export async function rotateSession(db: Database, presented: string | undefined): Promise<RotationResult> {
  if (!presented) return { ok: false, reason: "missing" };

  const claims = await verifyToken(presented, "refresh");
  if (!claims) return { ok: false, reason: "invalid" };

  const outcome = await db.transaction(async (tx) => {
    const [record] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.jti, claims.jti))
      .for("update")
      .limit(1);

    if (!record) {
      // Signed correctly but not on record: the row was purged after expiry, or
      // this is a token from before a secret rotation.
      return { ok: false as const, reason: "revoked" as const };
    }

    if (record.revokedAt) {
      // A token that was already rotated out is being presented again. Treated
      // as a possible theft: everything this account holds is revoked, which
      // costs a legitimate user one sign-in and costs an attacker the session.
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, record.userId), isNull(refreshTokens.revokedAt)));
      return { ok: false as const, reason: "reused" as const };
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      return { ok: false as const, reason: "expired" as const };
    }

    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, record.id));

    return { ok: true as const, userId: record.userId };
  });

  if (!outcome.ok) return outcome;

  await issueSession(db, outcome.userId);
  return { ok: true, userId: outcome.userId };
}

/** Revokes the single session a refresh token belongs to. Used by sign-out. */
export async function revokeSession(db: Database, presented: string | undefined): Promise<void> {
  if (!presented) return;
  const claims = await verifyToken(presented, "refresh");
  if (!claims) return;

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.jti, claims.jti), isNull(refreshTokens.revokedAt)));
}

/**
 * Revokes every live session for an account.
 *
 * Called on password change, password reset and ban. If a password was reset
 * because credentials leaked, every session open at that moment is suspect —
 * leaving them alive would make the reset largely decorative.
 */
export async function revokeAllSessions(db: Database, userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

/**
 * Deletes refresh tokens that are past their expiry.
 *
 * A revoked row has to outlive its token for reuse detection to work, but not
 * forever — once the token could not be valid anyway, the row is only taking up
 * space. Called opportunistically from the health endpoint rather than from a
 * scheduled job, so the deployment needs no cron to stay tidy.
 */
export async function purgeExpiredRefreshTokens(db: Database): Promise<number> {
  const deleted = await db
    .delete(refreshTokens)
    .where(lt(refreshTokens.expiresAt, new Date()))
    .returning({ id: refreshTokens.id });
  return deleted.length;
}
