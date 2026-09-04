/**
 * Single-use, time-limited tokens for confirming an address and resetting a
 * password.
 *
 * Only the SHA-256 hash of the token is stored. A database leak on its own then
 * cannot be used to confirm or reset anybody's account — the attacker holds
 * hashes, and the link in the mailbox is the only thing that verifies against
 * one.
 *
 * SHA-256 rather than scrypt, deliberately. These tokens are 256 bits of
 * `randomBytes`, single-use, and looked up by exact hash match on a request
 * path that must stay fast. A slow hash defends against offline brute-force of
 * a *low-entropy* secret, which is what a password is and what this is not.
 */
import { createHash, randomBytes } from "node:crypto";

import { and, eq, isNull, lt } from "drizzle-orm";

import { type Database } from "@/db/client";
import { verificationTokens } from "@/db/schema";

export type TokenPurpose = "email_verification" | "password_reset";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issues a token and returns the plaintext — the only time it exists in a
 * readable form. The caller emails it and must not log or store it.
 */
export async function issueToken(
  db: Database,
  userId: string,
  purpose: TokenPurpose,
  ttlSeconds: number,
): Promise<string> {
  const plaintext = randomBytes(32).toString("base64url");

  // Any outstanding token for the same purpose is invalidated first. Without
  // this, clicking "resend" three times leaves three live links, and the two
  // older ones stay usable for their full lifetime — a password-reset link is
  // an account takeover, so the fewer live at once the better.
  await db
    .update(verificationTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(verificationTokens.userId, userId),
        eq(verificationTokens.purpose, purpose),
        isNull(verificationTokens.usedAt),
      ),
    );

  await db.insert(verificationTokens).values({
    userId,
    purpose,
    tokenHash: hashToken(plaintext),
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
  });

  return plaintext;
}

/**
 * Consumes a token, returning the user id it belonged to, or null.
 *
 * The update is conditional on the token still being unused and unexpired, and
 * the returned row count is what decides the outcome. Checking first and then
 * updating would let two concurrent requests both pass the check and both
 * consume the same token — which for a password reset means two different
 * passwords being set from one link.
 */
export async function consumeToken(
  db: Database,
  plaintext: string,
  purpose: TokenPurpose,
): Promise<string | null> {
  const now = new Date();

  const consumed = await db
    .update(verificationTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(verificationTokens.tokenHash, hashToken(plaintext)),
        eq(verificationTokens.purpose, purpose),
        isNull(verificationTokens.usedAt),
      ),
    )
    .returning({ userId: verificationTokens.userId, expiresAt: verificationTokens.expiresAt });

  const row = consumed[0];
  if (!row) return null;
  // Expiry is checked after the atomic claim rather than inside it, so an
  // expired token is still burnt on use instead of remaining available to retry.
  if (row.expiresAt.getTime() <= now.getTime()) return null;

  return row.userId;
}

/** Removes tokens that are past their expiry. Called from the health endpoint. */
export async function purgeExpiredTokens(db: Database): Promise<number> {
  const deleted = await db
    .delete(verificationTokens)
    .where(lt(verificationTokens.expiresAt, new Date()))
    .returning({ id: verificationTokens.id });
  return deleted.length;
}
