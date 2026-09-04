/**
 * Account operations: registration, sign-in, address confirmation, password
 * reset and change.
 *
 * Several responses here are deliberately vaguer than they could be, and each
 * one is a decision rather than an oversight:
 *
 * - Sign-in fails identically for an unknown address and a wrong password, and
 *   spends the same time on both (see `spendVerificationBudget`). Otherwise the
 *   endpoint tells an attacker which addresses have accounts — and on this
 *   platform, "does this person have a Locora account" is itself sensitive.
 *
 * - "Forgot password" reports success whether or not the address is registered,
 *   for the same reason.
 *
 * - Registration is the one exception: it says plainly that an account already
 *   exists. The alternative is somebody unable to sign in, unable to register,
 *   and given no clue why — and the address is already known to whoever typed
 *   it, so the disclosure is to the person it belongs to in the overwhelming
 *   majority of cases.
 */
import { eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { env } from "@/server/config/env";
import { send } from "@/server/email/mailer";
import {
  passwordChangedEmail,
  passwordResetEmail,
  verificationEmail,
} from "@/server/email/templates";
import { badRequest, conflict, forbidden, unauthorized } from "@/server/http/errors";
import { logger } from "@/server/observability/logger";

import { reconcileBootstrapAdmin } from "./bootstrap-admin";
import type { CurrentUser } from "./current-user";
import { hashPassword, needsRehash, spendVerificationBudget, verifyPassword } from "./password";
import { issueSession, revokeAllSessions } from "./session";
import { consumeToken, issueToken } from "./verification-tokens";

export interface RegisterResult {
  userId: string;
  /** Whether the confirmation email was handed off, so the UI can be honest about it. */
  emailSent: boolean;
}

export async function register(input: {
  email: string;
  password: string;
  fullName: string | null;
  phone: string | null;
}): Promise<RegisterResult> {
  const db = getDb();

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    // Case-insensitive, matching the unique index. A plain equality check here
    // would let "Ada@x.com" through when "ada@x.com" exists, and the insert
    // would then fail on the constraint with an error nobody can act on.
    .where(sql`lower(${users.email}) = ${input.email}`)
    .limit(1);

  if (existing) {
    throw conflict("An account with this email address already exists. Try signing in instead.");
  }

  const passwordHash = await hashPassword(input.password);

  let userId: string;
  try {
    const [created] = await db
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        phone: input.phone,
        role: "user",
      })
      .returning({ id: users.id });
    if (!created) throw new Error("Insert returned no row");
    userId = created.id;
  } catch (error) {
    // The unique index is the authority. Two simultaneous registrations for the
    // same address both pass the check above; one of them lands here.
    if (isUniqueViolation(error)) {
      throw conflict("An account with this email address already exists. Try signing in instead.");
    }
    throw error;
  }

  // Runs after the insert so the bootstrap administrator is granted whichever
  // order things happen in — the variable set before they register, or after.
  await reconcileBootstrapAdmin(db);

  const token = await issueToken(db, userId, "email_verification", env.emailVerificationTtlSeconds);
  const link = `${env.siteUrl}/verify-email?token=${encodeURIComponent(token)}`;
  const emailSent = await send(input.email, verificationEmail(link, env.emailVerificationTtlSeconds));

  logger.info("Account registered", { userId, emailSent });
  return { userId, emailSent };
}

/**
 * Verifies credentials and starts a session.
 *
 * Returns the signed-in user. Throws 401 for bad credentials and 403 for a
 * banned account — the distinction is safe here because a correct password has
 * already been supplied, so the caller is the account holder.
 */
export async function signIn(input: { email: string; password: string }): Promise<CurrentUser> {
  const db = getDb();

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      passwordHash: users.passwordHash,
      role: users.role,
      emailVerifiedAt: users.emailVerifiedAt,
      isBanned: users.isBanned,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(sql`lower(${users.email}) = ${input.email}`)
    .limit(1);

  if (!row) {
    // Spend the same work as a real verification would, so the response time
    // does not reveal whether the address exists.
    await spendVerificationBudget(input.password);
    throw unauthorized("That email address and password do not match.");
  }

  const passwordMatches = await verifyPassword(input.password, row.passwordHash);
  if (!passwordMatches) {
    throw unauthorized("That email address and password do not match.");
  }

  if (row.isBanned) {
    throw forbidden(
      "This account has been suspended. Contact Locora if you believe that is a mistake.",
    );
  }

  // Sign-in is the only moment the plaintext is available, so it is the only
  // moment a hash made with weaker parameters can be upgraded.
  if (needsRehash(row.passwordHash)) {
    const upgraded = await hashPassword(input.password);
    await db
      .update(users)
      .set({ passwordHash: upgraded, updatedAt: new Date() })
      .where(eq(users.id, row.id));
    logger.info("Password hash upgraded to current parameters", { userId: row.id });
  }

  await issueSession(db, row.id);

  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    role: row.role,
    isEmailVerified: row.emailVerifiedAt !== null,
    createdAt: row.createdAt,
  };
}

export async function confirmEmail(token: string): Promise<void> {
  const db = getDb();
  const userId = await consumeToken(db, token, "email_verification");
  if (!userId) {
    throw badRequest(
      "That confirmation link is no longer valid. Request a new one from your dashboard.",
    );
  }

  await db
    .update(users)
    .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));

  logger.info("Email address confirmed", { userId });
}

/** Reissues a confirmation link for a signed-in, unconfirmed account. */
export async function resendConfirmation(user: CurrentUser): Promise<boolean> {
  if (user.isEmailVerified) {
    throw badRequest("This address is already confirmed.");
  }

  const db = getDb();
  const token = await issueToken(db, user.id, "email_verification", env.emailVerificationTtlSeconds);
  const link = `${env.siteUrl}/verify-email?token=${encodeURIComponent(token)}`;
  return send(user.email, verificationEmail(link, env.emailVerificationTtlSeconds));
}

/**
 * Starts a password reset. Reports nothing about whether the address exists.
 *
 * Returns void rather than a boolean on purpose — there is no useful signal to
 * give the caller that would not also be a signal to somebody enumerating
 * addresses.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const db = getDb();

  const [row] = await db
    .select({ id: users.id, email: users.email, isBanned: users.isBanned })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  // A suspended account is not given a route back in via a reset link.
  if (!row || row.isBanned) {
    logger.info("Password reset requested for an address with no eligible account");
    return;
  }

  const token = await issueToken(db, row.id, "password_reset", env.passwordResetTtlSeconds);
  const link = `${env.siteUrl}/reset-password?token=${encodeURIComponent(token)}`;
  await send(row.email, passwordResetEmail(link, env.passwordResetTtlSeconds));
  logger.info("Password reset link sent", { userId: row.id });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const db = getDb();
  const userId = await consumeToken(db, token, "password_reset");
  if (!userId) {
    throw badRequest("That reset link is no longer valid. Request a new one to try again.");
  }

  const passwordHash = await hashPassword(newPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));
    // Every live session is revoked. If the reset happened because credentials
    // leaked, any session open at this moment is suspect — leaving them alive
    // would make the reset largely decorative.
    await revokeAllSessions(tx, userId);
  });

  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (row) void send(row.email, passwordChangedEmail());

  logger.info("Password reset completed", { userId });
}

/**
 * Changes the password of a signed-in user.
 *
 * Every other session is revoked and this one is reissued, so changing a
 * password because a device was lost actually ejects that device, without
 * signing the user out of the browser they are using.
 */
export async function changePassword(
  user: CurrentUser,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  const db = getDb();

  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!row) throw unauthorized();

  const matches = await verifyPassword(input.currentPassword, row.passwordHash);
  if (!matches) {
    throw unauthorized("That is not your current password.");
  }

  const passwordHash = await hashPassword(input.newPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await revokeAllSessions(tx, user.id);
  });

  await issueSession(db, user.id);
  void send(user.email, passwordChangedEmail());

  logger.info("Password changed", { userId: user.id });
}

export async function updateProfile(
  user: CurrentUser,
  input: { fullName: string | null; phone: string | null },
): Promise<void> {
  try {
    await getDb()
      .update(users)
      .set({ fullName: input.fullName, phone: input.phone, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("That phone number is already on another account.");
    }
    throw error;
  }
}

/** PostgreSQL's unique-violation SQLSTATE. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
