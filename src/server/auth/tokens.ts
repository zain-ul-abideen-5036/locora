/**
 * Signing and verifying session tokens.
 *
 * Uses `jose`, which is built on Web Crypto and therefore runs unchanged in the
 * Node runtime and in middleware on the Edge runtime. That matters: middleware
 * needs to verify an access token to decide a redirect, and a Node-only JWT
 * library would force that check into a full function invocation on every
 * navigation.
 *
 * Two token types, with different jobs:
 *
 * - **access** (15 minutes) — proves who the caller is. Sent on every request.
 *   Stateless: it is never looked up, so verification costs no database round
 *   trip. Kept short precisely because it cannot be revoked.
 * - **refresh** (7 days) — proves the right to a *new* access token, and
 *   nothing else. Its `jti` is recorded in `refresh_tokens`, so it can be
 *   revoked, and its reuse can be detected.
 *
 * A refresh token is deliberately not accepted where an access token is
 * expected, or the long-lived credential would become the short-lived one.
 * `verifyToken` therefore takes the expected type and rejects a mismatch.
 */
import { jwtVerify, SignJWT } from "jose";

import { env } from "@/server/config/env";

export type TokenType = "access" | "refresh";

export interface TokenClaims {
  /** The user's id. */
  sub: string;
  type: TokenType;
  /** Unique per token. For refresh tokens this is the handle stored in the database. */
  jti: string;
}

const ISSUER = "locora";
const ALGORITHM = "HS256";

/**
 * A development-only signing key.
 *
 * Made obvious rather than random: a random per-process key means every restart
 * of the dev server logs you out, which is a poor enough experience that it
 * invites setting a real secret in a place that gets committed. This value can
 * never be used in production — `assertProductionConfig` refuses to deploy
 * without an explicit AUTH_SECRET before a request is ever served.
 */
const DEV_SECRET = "locora-development-only-signing-key-do-not-use-in-production";

let cachedKey: Uint8Array | undefined;
let warnedAboutDevSecret = false;

function signingKey(): Uint8Array {
  if (cachedKey) return cachedKey;

  let secret = env.authSecret;
  if (!secret) {
    if (env.isProduction) {
      // Unreachable via a normal deploy, which is gated by
      // assertProductionConfig. Present because "unreachable" and "impossible"
      // are different things, and the consequence here is tokens signed with a
      // published constant.
      throw new Error("AUTH_SECRET is required in production and is not set.");
    }
    if (!warnedAboutDevSecret) {
      warnedAboutDevSecret = true;
      console.warn(
        "[auth] AUTH_SECRET is not set — using the development signing key. " +
          "Set AUTH_SECRET before deploying.",
      );
    }
    secret = DEV_SECRET;
  }

  cachedKey = new TextEncoder().encode(secret);
  return cachedKey;
}

/** Test-only: lets a suite change AUTH_SECRET between cases. */
export function resetSigningKeyCache(): void {
  cachedKey = undefined;
}

function newJti(): string {
  return crypto.randomUUID();
}

export interface SignedToken {
  token: string;
  jti: string;
  expiresAt: Date;
}

async function sign(userId: string, type: TokenType, ttlSeconds: number): Promise<SignedToken> {
  const jti = newJti();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + ttlSeconds;

  const token = await new SignJWT({ type })
    .setProtectedHeader({ alg: ALGORITHM, typ: "JWT" })
    .setSubject(userId)
    .setJti(jti)
    .setIssuer(ISSUER)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(signingKey());

  return { token, jti, expiresAt: new Date(expiresAt * 1000) };
}

export function signAccessToken(userId: string): Promise<SignedToken> {
  return sign(userId, "access", env.accessTokenTtlSeconds);
}

export function signRefreshToken(userId: string): Promise<SignedToken> {
  return sign(userId, "refresh", env.refreshTokenTtlSeconds);
}

/**
 * Returns the claims if the token is valid, correctly typed and unexpired;
 * `null` otherwise.
 *
 * Never throws and never distinguishes between failure modes. A caller has no
 * legitimate use for "the signature was wrong" versus "it expired" — but an
 * attacker does, so the two are indistinguishable from outside.
 */
export async function verifyToken(
  token: string,
  expectedType: TokenType,
): Promise<TokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      issuer: ISSUER,
      // Pinned. Without it a token can nominate its own algorithm, which is the
      // route to the classic `alg: none` and HS/RS confusion attacks.
      algorithms: [ALGORITHM],
    });

    if (payload.type !== expectedType) return null;
    if (typeof payload.sub !== "string" || typeof payload.jti !== "string") return null;

    return { sub: payload.sub, type: expectedType, jti: payload.jti };
  } catch {
    return null;
  }
}
