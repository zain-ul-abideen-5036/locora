/**
 * @vitest-environment node
 *
 * Runs in the node environment, not jsdom. jsdom installs its own realm's
 * `Uint8Array`, which is a different constructor from Node's — `jose` checks
 * the key's type and rejects a key built with the wrong one, failing with
 * "Received an instance of Uint8Array" about an actual Uint8Array. Nothing in
 * this file needs a DOM, so the fix is to not have one.
 */
import { describe, expect, it } from "vitest";

import {
  hashPassword,
  needsRehash,
  spendVerificationBudget,
  verifyPassword,
} from "@/server/auth/password";
import { signAccessToken, signRefreshToken, verifyToken } from "@/server/auth/tokens";

describe("password hashing", () => {
  it("produces a self-describing hash that carries its own cost parameters", async () => {
    const hash = await hashPassword("CorrectHorse7Battery");
    const [algorithm, n, r, p, salt, digest] = hash.split("$");

    expect(algorithm).toBe("scrypt");
    // Stored alongside the hash so they can be raised later without
    // invalidating existing passwords.
    expect(Number(n)).toBe(65_536);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
    expect(salt).toBeTruthy();
    expect(digest).toBeTruthy();
  });

  it("never stores the password itself", async () => {
    const password = "CorrectHorse7Battery";
    const hash = await hashPassword(password);
    expect(hash).not.toContain(password);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const first = await hashPassword("CorrectHorse7Battery");
    const second = await hashPassword("CorrectHorse7Battery");
    // Without a per-password salt, identical passwords produce identical hashes
    // and one cracked hash reveals every account that shares it.
    expect(first).not.toBe(second);
    expect(await verifyPassword("CorrectHorse7Battery", first)).toBe(true);
    expect(await verifyPassword("CorrectHorse7Battery", second)).toBe(true);
  });

  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("CorrectHorse7Battery");
    expect(await verifyPassword("CorrectHorse7Battery", hash)).toBe(true);
    expect(await verifyPassword("CorrectHorse7Batteru", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("treats visually identical Unicode forms as the same password", async () => {
    // The same accented character, composed and decomposed. A password typed on
    // macOS and re-typed from a Windows password manager can differ this way,
    // and without NFC normalisation the second attempt fails to verify.
    const composed = "Passwörd12345";
    const decomposed = "Passwörd12345";
    expect(composed).not.toBe(decomposed);

    const hash = await hashPassword(composed);
    expect(await verifyPassword(decomposed, hash)).toBe(true);
  });

  it("rejects a malformed or tampered stored hash instead of throwing", async () => {
    // A corrupted row must fail closed. Throwing would turn a bad record into a
    // 500 on the sign-in path.
    for (const stored of [
      "",
      "not-a-hash",
      "scrypt$65536$8$1$onlyfourparts",
      "bcrypt$65536$8$1$c2FsdA==$aGFzaA==",
      "scrypt$abc$8$1$c2FsdA==$aGFzaA==",
    ]) {
      expect(await verifyPassword("anything", stored), stored).toBe(false);
    }
  });

  it("refuses absurd cost parameters in a stored hash", async () => {
    // A stored record is not a trusted input if the database is ever tampered
    // with, and N = 2^30 would be a memory-exhaustion denial of service against
    // our own process on the next sign-in attempt.
    const hostile = `scrypt$1073741824$8$1$c2FsdA==$aGFzaA==`;
    expect(await verifyPassword("anything", hostile)).toBe(false);
  });

  it("flags a hash made with weaker parameters for upgrade", async () => {
    const current = await hashPassword("CorrectHorse7Battery");
    expect(needsRehash(current)).toBe(false);

    // What a hash created under an earlier, cheaper policy looks like.
    expect(needsRehash("scrypt$16384$8$1$c2FsdA==$aGFzaA==")).toBe(true);
    // An unparseable hash counts as needing replacement.
    expect(needsRehash("nonsense")).toBe(true);
  });

  it("spends comparable work whether or not an account exists", async () => {
    // The defence against account enumeration by response timing. Asserted
    // loosely — a CI runner's scheduling noise is larger than the difference
    // being measured — but a regression that skipped the work entirely would
    // show up as milliseconds against hundreds.
    const hash = await hashPassword("CorrectHorse7Battery");

    const realStart = performance.now();
    await verifyPassword("WrongPassword123", hash);
    const realDuration = performance.now() - realStart;

    const decoyStart = performance.now();
    await spendVerificationBudget("WrongPassword123");
    const decoyDuration = performance.now() - decoyStart;

    expect(decoyDuration).toBeGreaterThan(realDuration * 0.25);
  });
});

describe("session tokens", () => {
  const userId = "11111111-1111-4111-8111-111111111111";

  it("issues an access token that verifies and carries the user id", async () => {
    const { token, jti, expiresAt } = await signAccessToken(userId);

    const claims = await verifyToken(token, "access");
    expect(claims).not.toBeNull();
    expect(claims?.sub).toBe(userId);
    expect(claims?.jti).toBe(jti);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("will not accept a refresh token where an access token is expected", async () => {
    // Otherwise the seven-day credential becomes the fifteen-minute one, and a
    // captured refresh token would authenticate every request directly.
    const { token } = await signRefreshToken(userId);
    expect(await verifyToken(token, "access")).toBeNull();
    expect(await verifyToken(token, "refresh")).not.toBeNull();
  });

  it("will not accept an access token where a refresh token is expected", async () => {
    const { token } = await signAccessToken(userId);
    expect(await verifyToken(token, "refresh")).toBeNull();
  });

  it("gives every token a distinct jti", async () => {
    const first = await signRefreshToken(userId);
    const second = await signRefreshToken(userId);
    // The jti is the handle stored in refresh_tokens; a collision would make one
    // session revoke another.
    expect(first.jti).not.toBe(second.jti);
  });

  it("rejects a token whose signature has been tampered with", async () => {
    const { token } = await signAccessToken(userId);
    const parts = token.split(".");

    // Payload swapped for one claiming a different subject, signature untouched.
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: "99999999-9999-4999-8999-999999999999", type: "access", jti: "x" }),
    ).toString("base64url");
    expect(await verifyToken(`${parts[0]}.${forgedPayload}.${parts[2]}`, "access")).toBeNull();

    // Signature altered.
    expect(await verifyToken(`${parts[0]}.${parts[1]}.deadbeef`, "access")).toBeNull();
  });

  it("rejects an unsigned token", async () => {
    // The classic `alg: none` attempt. `verifyToken` pins the algorithm, so
    // this cannot get through.
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: userId, type: "access", jti: "x", iss: "locora" }),
    ).toString("base64url");
    expect(await verifyToken(`${header}.${payload}.`, "access")).toBeNull();
  });

  it("rejects an expired token", async () => {
    // Signed with the real key but already past its expiry, so only the time
    // check can catch it.
    const { SignJWT } = await import("jose");
    const key = new TextEncoder().encode(process.env.AUTH_SECRET);
    const past = Math.floor(Date.now() / 1000) - 3600;

    const token = await new SignJWT({ type: "access" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userId)
      .setJti("expired")
      .setIssuer("locora")
      .setIssuedAt(past - 60)
      .setExpirationTime(past)
      .sign(key);

    expect(await verifyToken(token, "access")).toBeNull();
  });

  it("rejects a token signed with a different key", async () => {
    const { SignJWT } = await import("jose");
    const wrongKey = new TextEncoder().encode("a-completely-different-signing-key-000000");

    const token = await new SignJWT({ type: "access" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userId)
      .setJti("foreign")
      .setIssuer("locora")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(wrongKey);

    expect(await verifyToken(token, "access")).toBeNull();
  });

  it("rejects a token issued by something else", async () => {
    const { SignJWT } = await import("jose");
    const key = new TextEncoder().encode(process.env.AUTH_SECRET);

    const token = await new SignJWT({ type: "access" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userId)
      .setJti("wrong-issuer")
      .setIssuer("somebody-else")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(key);

    expect(await verifyToken(token, "access")).toBeNull();
  });

  it("returns null rather than throwing for anything unparseable", async () => {
    // The verifier is on an unauthenticated path, so it has to be total.
    for (const garbage of ["", "not.a.token", "a.b.c.d", "...", "eyJhbGciOiJIUzI1NiJ9"]) {
      expect(await verifyToken(garbage, "access"), garbage).toBeNull();
    }
  });
});
