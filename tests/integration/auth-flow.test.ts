import { and, eq, isNull } from "drizzle-orm";
import { expect, it } from "vitest";

import { getDb } from "@/db/client";
import { refreshTokens, users, verificationTokens } from "@/db/schema";
import { getCurrentUser, requireAdmin, requireUser, requireVerifiedUser } from "@/server/auth/current-user";
import {
  changePassword,
  confirmEmail,
  register,
  requestPasswordReset,
  resetPassword,
  signIn,
} from "@/server/auth/service";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  issueSession,
  revokeSession,
  rotateSession,
} from "@/server/auth/session";
import { verifyPassword } from "@/server/auth/password";
import { setBanned } from "@/server/admin/users";

import { createUser, describeDb, TEST_PASSWORD, uniqueEmail } from "../helpers/factories";
import { testCookies } from "../setup/integration";

/**
 * Registration, sign-in, and the session lifecycle.
 *
 * These run the real code paths, including the cookie writes, against the real
 * database. The refresh-rotation and reuse-detection tests in particular cannot
 * be written meaningfully any other way — the behaviour is entirely about what
 * rows exist and what state they are in.
 */

describeDb("registration", () => {
  it("creates an account with a hashed password and an unconfirmed address", async () => {
    const email = uniqueEmail();
    const { userId } = await register({
      email,
      password: "GoodPassphrase9",
      fullName: "Ada Lovelace",
      phone: null,
    });

    const [row] = await getDb().select().from(users).where(eq(users.id, userId));
    expect(row).toBeDefined();
    expect(row?.email).toBe(email);
    // Never the plaintext, and verifiable against the original.
    expect(row?.passwordHash).not.toContain("GoodPassphrase9");
    expect(await verifyPassword("GoodPassphrase9", row?.passwordHash ?? "")).toBe(true);
    // Confirmation gates filing, so a fresh account starts unconfirmed.
    expect(row?.emailVerifiedAt).toBeNull();
    expect(row?.role).toBe("user");
  });

  it("issues a single-use confirmation token, stored only as a hash", async () => {
    const email = uniqueEmail();
    const { userId } = await register({ email, password: "GoodPassphrase9", fullName: null, phone: null });

    const tokens = await getDb()
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.userId, userId));

    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.purpose).toBe("email_verification");
    // A database leak on its own must not be usable to confirm an account.
    expect(tokens[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens[0]?.usedAt).toBeNull();
  });

  it("refuses a second account on the same address, case-insensitively", async () => {
    const email = uniqueEmail();
    await register({ email, password: "GoodPassphrase9", fullName: null, phone: null });

    // The reason the unique index is on lower(email): otherwise a family member
    // who capitalises differently on a second visit gets an empty dashboard and
    // cannot find the report they filed.
    await expect(
      register({ email: email.toUpperCase(), password: "GoodPassphrase9", fullName: null, phone: null }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describeDb("sign-in", () => {
  it("accepts the right credentials and starts a session", async () => {
    const user = await createUser();

    const signedIn = await signIn({ email: user.email, password: TEST_PASSWORD });
    expect(signedIn.id).toBe(user.id);

    // Both cookies set, and the refresh token recorded so it can be revoked.
    expect(testCookies.get(ACCESS_COOKIE)).toBeTruthy();
    expect(testCookies.get(REFRESH_COOKIE)).toBeTruthy();

    const stored = await getDb().select().from(refreshTokens).where(eq(refreshTokens.userId, user.id));
    expect(stored).toHaveLength(1);
    expect(stored[0]?.revokedAt).toBeNull();
  });

  it("fails identically for a wrong password and an unknown address", async () => {
    const user = await createUser();

    const wrongPassword = await signIn({ email: user.email, password: "NotThePassword1" }).catch(
      (error) => error,
    );
    const unknownAddress = await signIn({
      email: uniqueEmail("nobody"),
      password: "NotThePassword1",
    }).catch((error) => error);

    // Identical status and identical message: anything else turns this endpoint
    // into a way to check who has a Locora account.
    expect(wrongPassword.status).toBe(401);
    expect(unknownAddress.status).toBe(401);
    expect(wrongPassword.message).toBe(unknownAddress.message);
  });

  it("sets no cookies on a failed sign-in", async () => {
    const user = await createUser();
    await expect(signIn({ email: user.email, password: "NotThePassword1" })).rejects.toBeDefined();
    expect(testCookies.get(ACCESS_COOKIE)).toBeUndefined();
  });

  it("refuses a suspended account with a distinct 403", async () => {
    // Safe to distinguish here, because a correct password has already been
    // supplied — the caller is the account holder and needs to know why.
    const user = await createUser({ banned: true });
    await expect(signIn({ email: user.email, password: TEST_PASSWORD })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("matches the address case-insensitively", async () => {
    const user = await createUser({ email: uniqueEmail("mixedcase") });
    const signedIn = await signIn({ email: user.email.toUpperCase(), password: TEST_PASSWORD });
    expect(signedIn.id).toBe(user.id);
  });
});

describeDb("session rotation and reuse detection", () => {
  it("issues a new token pair and revokes the one presented", async () => {
    const user = await createUser();
    await issueSession(getDb(), user.id);

    const firstRefresh = testCookies.get(REFRESH_COOKIE);
    expect(firstRefresh).toBeTruthy();

    const result = await rotateSession(getDb(), firstRefresh);
    expect(result.ok).toBe(true);

    const secondRefresh = testCookies.get(REFRESH_COOKIE);
    expect(secondRefresh).toBeTruthy();
    expect(secondRefresh).not.toBe(firstRefresh);

    // Two rows: the first revoked, the second live. The revoked row is kept so
    // a replay can still be recognised as one.
    const rows = await getDb().select().from(refreshTokens).where(eq(refreshTokens.userId, user.id));
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.revokedAt === null)).toHaveLength(1);
  });

  it("revokes every session when an already-used refresh token is replayed", async () => {
    const user = await createUser();
    await issueSession(getDb(), user.id);

    const captured = testCookies.get(REFRESH_COOKIE);
    await rotateSession(getDb(), captured);

    // The scenario this defends against: somebody captured the token, the
    // legitimate client has since rotated it, and the attacker now presents it.
    const replay = await rotateSession(getDb(), captured);
    expect(replay).toMatchObject({ ok: false, reason: "reused" });

    const live = await getDb()
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)));

    // Everything revoked, including the token the legitimate client held. That
    // costs a genuine user one sign-in and costs an attacker the session.
    expect(live).toHaveLength(0);
  });

  it("refuses a refresh token that was never recorded", async () => {
    const user = await createUser();
    const { signRefreshToken } = await import("@/server/auth/tokens");
    // Correctly signed but with no row — a token from before a purge, or a
    // forgery by somebody who obtained the signing key but not the database.
    const { token } = await signRefreshToken(user.id);

    expect(await rotateSession(getDb(), token)).toMatchObject({ ok: false, reason: "revoked" });
  });

  it("refuses a missing or malformed token without throwing", async () => {
    expect(await rotateSession(getDb(), undefined)).toMatchObject({ ok: false, reason: "missing" });
    expect(await rotateSession(getDb(), "not-a-token")).toMatchObject({
      ok: false,
      reason: "invalid",
    });
  });

  it("revokes the session server-side on sign-out, not just the cookie", async () => {
    const user = await createUser();
    await issueSession(getDb(), user.id);
    const refresh = testCookies.get(REFRESH_COOKIE);

    await revokeSession(getDb(), refresh);
    await clearSessionCookies();

    // Clearing the cookie alone would leave a token valid for seven days in
    // whatever captured it.
    const live = await getDb()
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)));
    expect(live).toHaveLength(0);
    expect(testCookies.get(ACCESS_COOKIE)).toBeUndefined();
  });
});

describeDb("email confirmation", () => {
  it("confirms the address and burns the token", async () => {
    const email = uniqueEmail();
    const { userId } = await register({ email, password: "GoodPassphrase9", fullName: null, phone: null });

    // The plaintext is only ever in the email, so the test reaches for the row
    // and re-issues a token it knows — which is what `issueToken` returns.
    const { issueToken } = await import("@/server/auth/verification-tokens");
    const token = await issueToken(getDb(), userId, "email_verification", 3600);

    await confirmEmail(token);

    const [row] = await getDb().select().from(users).where(eq(users.id, userId));
    expect(row?.emailVerifiedAt).not.toBeNull();

    // Single use: a second attempt must fail.
    await expect(confirmEmail(token)).rejects.toMatchObject({ status: 400 });
  });

  it("invalidates an earlier token when a new one is issued", async () => {
    // Otherwise clicking "resend" three times leaves three live links.
    const user = await createUser({ verified: false });
    const { issueToken } = await import("@/server/auth/verification-tokens");

    const first = await issueToken(getDb(), user.id, "email_verification", 3600);
    const second = await issueToken(getDb(), user.id, "email_verification", 3600);

    await expect(confirmEmail(first)).rejects.toMatchObject({ status: 400 });
    await expect(confirmEmail(second)).resolves.toBeUndefined();
  });

  it("refuses an expired token", async () => {
    const user = await createUser({ verified: false });
    const { issueToken } = await import("@/server/auth/verification-tokens");
    // Negative TTL: already expired when issued.
    const token = await issueToken(getDb(), user.id, "email_verification", -60);

    await expect(confirmEmail(token)).rejects.toMatchObject({ status: 400 });
  });

  it("will not accept a reset token where a confirmation token is expected", async () => {
    // The purpose discriminator matters: otherwise a password-reset link could
    // be used to confirm an address, or worse the other way round.
    const user = await createUser({ verified: false });
    const { issueToken } = await import("@/server/auth/verification-tokens");
    const resetToken = await issueToken(getDb(), user.id, "password_reset", 3600);

    await expect(confirmEmail(resetToken)).rejects.toMatchObject({ status: 400 });
  });
});

describeDb("password reset", () => {
  it("sets a new password and revokes every session", async () => {
    const user = await createUser();
    await issueSession(getDb(), user.id);

    const { issueToken } = await import("@/server/auth/verification-tokens");
    const token = await issueToken(getDb(), user.id, "password_reset", 3600);

    await resetPassword(token, "BrandNewPass9");

    const [row] = await getDb().select().from(users).where(eq(users.id, user.id));
    expect(await verifyPassword("BrandNewPass9", row?.passwordHash ?? "")).toBe(true);
    expect(await verifyPassword(TEST_PASSWORD, row?.passwordHash ?? "")).toBe(false);

    // If the reset happened because credentials leaked, any session open at
    // that moment is suspect — leaving them alive makes the reset decorative.
    const live = await getDb()
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)));
    expect(live).toHaveLength(0);
  });

  it("makes the reset token single-use", async () => {
    const user = await createUser();
    const { issueToken } = await import("@/server/auth/verification-tokens");
    const token = await issueToken(getDb(), user.id, "password_reset", 3600);

    await resetPassword(token, "BrandNewPass9");
    await expect(resetPassword(token, "AnotherPass99")).rejects.toMatchObject({ status: 400 });
  });

  it("reveals nothing about whether an address is registered", async () => {
    // Both resolve to the same nothing. A difference here would make the
    // endpoint an account-enumeration tool.
    await expect(requestPasswordReset(uniqueEmail("nobody"))).resolves.toBeUndefined();
    const user = await createUser();
    await expect(requestPasswordReset(user.email)).resolves.toBeUndefined();
  });

  it("does not issue a reset token for a suspended account", async () => {
    // A suspended account should not be given a route back in.
    const user = await createUser({ banned: true });
    await requestPasswordReset(user.email);

    const tokens = await getDb()
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.userId, user.id));
    expect(tokens).toHaveLength(0);
  });
});

describeDb("changing a password while signed in", () => {
  it("requires the current password", async () => {
    const user = await createUser();
    await expect(
      changePassword(user, { currentPassword: "WrongCurrent1", newPassword: "BrandNewPass9" }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("revokes other sessions but leaves this one signed in", async () => {
    const user = await createUser();
    await issueSession(getDb(), user.id);
    const before = testCookies.get(REFRESH_COOKIE);

    await changePassword(user, { currentPassword: TEST_PASSWORD, newPassword: "BrandNewPass9" });

    // Exactly one live token: the reissued one. Changing a password because a
    // device was lost has to eject that device without signing the user out of
    // the browser they are using.
    const live = await getDb()
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)));
    expect(live).toHaveLength(1);
    expect(testCookies.get(REFRESH_COOKIE)).not.toBe(before);
  });
});

describeDb("identity resolution and guards", () => {
  it("resolves the signed-in user from the access cookie", async () => {
    const user = await createUser();
    await issueSession(getDb(), user.id);

    const current = await getCurrentUser();
    expect(current?.id).toBe(user.id);
    expect(current?.email).toBe(user.email);
  });

  it("returns nobody when there is no cookie", async () => {
    expect(await getCurrentUser()).toBeNull();
    await expect(requireUser()).rejects.toMatchObject({ status: 401 });
  });

  it("stops recognising a suspended account immediately, not when the token expires", async () => {
    // The reason the user row is loaded rather than trusting the token's claims.
    // A ban has to take effect now, not in up to fifteen minutes.
    const reviewer = await createUser({ role: "admin" });
    const user = await createUser();
    await issueSession(getDb(), user.id);

    expect(await getCurrentUser()).not.toBeNull();

    await setBanned(reviewer, user.id, true, "Testing");

    // Same cookie, still cryptographically valid, no longer an identity.
    expect(await getCurrentUser()).toBeNull();
    await expect(requireUser()).rejects.toMatchObject({ status: 401 });
  });

  it("refuses the review console to a standard account", async () => {
    const user = await createUser();
    await issueSession(getDb(), user.id);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
  });

  it("allows the review console to a reviewer", async () => {
    const reviewer = await createUser({ role: "admin" });
    await issueSession(getDb(), reviewer.id);
    await expect(requireAdmin()).resolves.toMatchObject({ id: reviewer.id });
  });

  it("blocks an unconfirmed account from filing, and exempts reviewers", async () => {
    const unconfirmed = await createUser({ verified: false });
    await issueSession(getDb(), unconfirmed.id);
    await expect(requireVerifiedUser()).rejects.toMatchObject({ status: 403 });

    testCookies.clear();

    // Reviewers are exempt: they may need to file on somebody's behalf from a
    // phone call or a walk-in.
    const reviewer = await createUser({ role: "admin", verified: false });
    await issueSession(getDb(), reviewer.id);
    await expect(requireVerifiedUser()).resolves.toMatchObject({ id: reviewer.id });
  });
});
