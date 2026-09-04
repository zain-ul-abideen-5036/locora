/**
 * Distributed rate limiting, backed by Postgres.
 *
 * ## Why not an in-memory counter
 *
 * A per-process `Map` is the obvious implementation and it is wrong here. Every
 * warm serverless instance keeps its own copy, so the effective limit is
 * whatever was configured multiplied by however many instances happen to be
 * running — a number that changes with traffic and is never visible in testing.
 * The defect only matters on the day somebody is actively abusing the service,
 * which is the one day it needs to work.
 *
 * ## Why not Redis
 *
 * Redis is the textbook answer and would be marginally faster. It is also a
 * second vendor, a second set of credentials, a second thing to be down and a
 * second bill, to solve a problem one indexed table solves at this scale. The
 * counter needs an atomic increment against shared state, and Postgres — which
 * is already a hard dependency — does that in a single statement.
 *
 * ## Fixed window, and what that costs
 *
 * This is a fixed window, not a sliding one, so a caller can spend their whole
 * quota at the end of one window and again at the start of the next. Sliding
 * windows are the standard rejoinder, but they need per-hit rows and a range
 * scan rather than one upsert. For a control whose job is to stop credential
 * stuffing and queue flooding, a burst of 2n over a window boundary is not a
 * meaningful weakness, and the simpler mechanism is the one that stays correct.
 *
 * ## Failing open
 *
 * If the counter query itself fails, the request is allowed through and the
 * failure is logged. That is a deliberate choice for this product: this is an
 * anti-abuse control on a service families use to report a missing person, and
 * refusing a legitimate report because a counter is unavailable is the worse
 * outcome. Note the asymmetry — the *database* being down fails the request
 * anyway, since there is nowhere to write a report to. This only covers the
 * narrow case of the limiter breaking while the rest works.
 */
import { sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { rateLimited } from "@/server/http/errors";
import { logger } from "@/server/observability/logger";

export interface RateLimitRule {
  /** Namespaces the counter, and names the action in logs. */
  action: string;
  limit: number;
  windowSeconds: number;
}

/**
 * The limits, in one place so they can be read as a policy rather than hunted
 * for across handlers.
 *
 * Sign-in and registration are keyed by IP address because there is no user
 * yet. Everything a signed-in caller does is keyed by user id, which is a much
 * better subject than an address: it survives a mobile network changing the
 * caller's IP mid-session, and it cannot be reset by switching networks.
 */
export const RATE_LIMITS = {
  login: { action: "login", limit: 10, windowSeconds: 600 },
  register: { action: "register", limit: 5, windowSeconds: 3600 },
  passwordReset: { action: "password-reset", limit: 5, windowSeconds: 3600 },
  emailResend: { action: "email-resend", limit: 5, windowSeconds: 3600 },
  // Generous, because a family filing about several people at once is a real
  // scenario and being throttled at that moment would be unforgivable. It still
  // bounds a script.
  reportCreate: { action: "report-create", limit: 12, windowSeconds: 3600 },
  photoUpload: { action: "photo-upload", limit: 60, windowSeconds: 3600 },
  abuseReport: { action: "abuse-report", limit: 20, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Increments the counter for `subject` under `rule` and reports whether the
 * caller is over the limit.
 *
 * The whole check is one statement. It has to be: reading the count and then
 * writing it back lets two concurrent requests both read the same value and
 * both decide they are under the limit. `ON CONFLICT DO UPDATE` with the window
 * reset expressed as a `CASE` inside the update makes the reset atomic too, so
 * a window rolling over mid-burst cannot lose or double-count a hit.
 */
export async function checkRateLimit(
  rule: RateLimitRule,
  subject: string,
): Promise<RateLimitResult> {
  const key = `${rule.action}:${subject}`;

  try {
    const result = await getDb().execute<{ count: number; expires_at: Date }>(sql`
      INSERT INTO rate_limits (key, count, window_started_at, expires_at)
      VALUES (
        ${key},
        1,
        now(),
        now() + make_interval(secs => ${rule.windowSeconds})
      )
      ON CONFLICT (key) DO UPDATE SET
        count = CASE
                  WHEN rate_limits.expires_at <= now() THEN 1
                  ELSE rate_limits.count + 1
                END,
        window_started_at = CASE
                  WHEN rate_limits.expires_at <= now() THEN now()
                  ELSE rate_limits.window_started_at
                END,
        expires_at = CASE
                  WHEN rate_limits.expires_at <= now()
                  THEN now() + make_interval(secs => ${rule.windowSeconds})
                  ELSE rate_limits.expires_at
                END
      RETURNING count, expires_at
    `);

    const row = result.rows[0];
    if (!row) {
      // RETURNING on an upsert always produces a row; if it somehow did not,
      // there is nothing to decide on.
      return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 };
    }

    const count = Number(row.count);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((new Date(row.expires_at).getTime() - Date.now()) / 1000),
    );

    return {
      allowed: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSeconds,
    };
  } catch (error) {
    logger.error("Rate limiter unavailable; allowing the request through", {
      action: rule.action,
      error: error instanceof Error ? error.message : String(error),
    });
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 };
  }
}

/** Throws a 429 with a `Retry-After` header when the caller is over the limit. */
export async function enforceRateLimit(rule: RateLimitRule, subject: string): Promise<void> {
  const result = await checkRateLimit(rule, subject);
  if (!result.allowed) {
    logger.warn("Rate limit exceeded", { action: rule.action });
    throw rateLimited(result.retryAfterSeconds);
  }
}

/**
 * The address to key an unauthenticated limit on.
 *
 * Vercel sets `x-forwarded-for` at its edge and the leftmost entry is the real
 * client. That header is trivially spoofable in general — which is exactly why
 * it is only used for anonymous limits, where the alternative is no limit at
 * all, and never for authorisation. Anything a signed-in caller does is keyed
 * by user id instead.
 */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() ?? "unknown";
}

/**
 * Deletes counters whose window has closed.
 *
 * Called opportunistically from the health endpoint rather than from a
 * scheduled job, so a deployment needs no cron configured to avoid slowly
 * accumulating dead rows.
 */
export async function purgeExpiredRateLimits(): Promise<number> {
  const result = await getDb().execute(sql`DELETE FROM rate_limits WHERE expires_at <= now()`);
  return result.rowCount ?? 0;
}
