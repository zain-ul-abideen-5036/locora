import { sql } from "drizzle-orm";
import { expect, it } from "vitest";

import { getDb } from "@/db/client";
import {
  checkRateLimit,
  clientAddress,
  enforceRateLimit,
  purgeExpiredRateLimits,
  RATE_LIMITS,
} from "@/server/security/rate-limit";

import { describeDb } from "../helpers/factories";

/**
 * The rate limiter, against a real database.
 *
 * There is no useful unit test for this. The whole point of the design is that
 * the counter is *shared* — a per-process one would pass any in-memory test
 * while being silently wrong on a platform that runs several instances. The
 * only way to test the property that matters is to exercise the real atomic
 * upsert against real Postgres.
 */

const RULE = { action: "test-action", limit: 3, windowSeconds: 60 };

describeDb("rate limiting", () => {
  it("allows up to the limit and refuses beyond it", async () => {
    for (let attempt = 1; attempt <= RULE.limit; attempt += 1) {
      const result = await checkRateLimit(RULE, "subject-a");
      expect(result.allowed, `attempt ${attempt} should be allowed`).toBe(true);
    }

    const overLimit = await checkRateLimit(RULE, "subject-a");
    expect(overLimit.allowed).toBe(false);
    expect(overLimit.remaining).toBe(0);
    // A well-behaved client is told exactly how long to wait rather than left
    // to guess and retry in a tight loop.
    expect(overLimit.retryAfterSeconds).toBeGreaterThan(0);
    expect(overLimit.retryAfterSeconds).toBeLessThanOrEqual(RULE.windowSeconds);
  });

  it("reports the remaining allowance as it counts down", async () => {
    expect((await checkRateLimit(RULE, "subject-b")).remaining).toBe(2);
    expect((await checkRateLimit(RULE, "subject-b")).remaining).toBe(1);
    expect((await checkRateLimit(RULE, "subject-b")).remaining).toBe(0);
  });

  it("keeps a separate counter per subject", async () => {
    // Otherwise one abusive caller locks out everybody else on the endpoint.
    for (let attempt = 0; attempt < RULE.limit; attempt += 1) {
      await checkRateLimit(RULE, "noisy");
    }
    expect((await checkRateLimit(RULE, "noisy")).allowed).toBe(false);
    expect((await checkRateLimit(RULE, "quiet")).allowed).toBe(true);
  });

  it("keeps a separate counter per action", async () => {
    // Spending the sign-in allowance must not also block filing a report.
    const other = { action: "other-action", limit: 3, windowSeconds: 60 };

    for (let attempt = 0; attempt < RULE.limit; attempt += 1) {
      await checkRateLimit(RULE, "shared-subject");
    }
    expect((await checkRateLimit(RULE, "shared-subject")).allowed).toBe(false);
    expect((await checkRateLimit(other, "shared-subject")).allowed).toBe(true);
  });

  it("counts concurrent requests atomically, with none lost", async () => {
    // The reason the check is one statement. Reading the count and writing it
    // back lets two simultaneous requests both read the same value and both
    // decide they are under the limit — which is exactly the situation a rate
    // limiter exists for.
    const generous = { action: "concurrent", limit: 1000, windowSeconds: 60 };

    const CONCURRENT = 25;
    await Promise.all(
      Array.from({ length: CONCURRENT }, () => checkRateLimit(generous, "burst")),
    );

    const result = await getDb().execute<{ count: number }>(
      sql`SELECT count FROM rate_limits WHERE key = ${"concurrent:burst"}`,
    );
    // Exactly the number of calls made. A lost increment here is a request that
    // did not count towards the limit, which is the whole failure mode.
    expect(Number(result.rows[0]?.count)).toBe(CONCURRENT);
  });

  it("starts a fresh window once the previous one has closed", async () => {
    const brief = { action: "brief-window", limit: 2, windowSeconds: 60 };

    await checkRateLimit(brief, "subject-c");
    await checkRateLimit(brief, "subject-c");
    expect((await checkRateLimit(brief, "subject-c")).allowed).toBe(false);

    // Rather than sleeping for the window, the row is aged directly — the
    // reset is expressed inside the upsert, so this exercises the real branch.
    await getDb().execute(
      sql`UPDATE rate_limits SET expires_at = now() - interval '1 second' WHERE key = ${"brief-window:subject-c"}`,
    );

    const afterReset = await checkRateLimit(brief, "subject-c");
    expect(afterReset.allowed).toBe(true);
    // The count restarts at one rather than continuing to climb.
    expect(afterReset.remaining).toBe(1);
  });

  it("throws a 429 carrying Retry-After when enforced", async () => {
    for (let attempt = 0; attempt < RULE.limit; attempt += 1) {
      await enforceRateLimit(RULE, "subject-d");
    }

    try {
      await enforceRateLimit(RULE, "subject-d");
      throw new Error("expected enforceRateLimit to throw");
    } catch (error) {
      const appError = error as { status: number; headers?: Record<string, string> };
      expect(appError.status).toBe(429);
      expect(appError.headers?.["Retry-After"]).toBeDefined();
      expect(Number(appError.headers?.["Retry-After"])).toBeGreaterThan(0);
    }
  });

  it("purges only windows that have closed", async () => {
    await checkRateLimit(RULE, "live-window");
    await checkRateLimit(RULE, "dead-window");
    await getDb().execute(
      sql`UPDATE rate_limits SET expires_at = now() - interval '1 hour' WHERE key = ${"test-action:dead-window"}`,
    );

    const purged = await purgeExpiredRateLimits();
    expect(purged).toBe(1);

    const remaining = await getDb().execute<{ key: string }>(sql`SELECT key FROM rate_limits`);
    expect(remaining.rows.map((row) => row.key)).toEqual(["test-action:live-window"]);
  });

  it("applies the configured limits to the endpoints that matter", () => {
    // A policy assertion rather than a behavioural one: these numbers are the
    // product's anti-abuse posture, and changing one should be a deliberate act
    // that updates this test.
    expect(RATE_LIMITS.login).toMatchObject({ limit: 10, windowSeconds: 600 });
    expect(RATE_LIMITS.register.limit).toBe(5);
    expect(RATE_LIMITS.passwordReset.limit).toBe(5);
    // Generous on purpose: a family filing about several people at once is a
    // real scenario, and being throttled at that moment would be unforgivable.
    expect(RATE_LIMITS.reportCreate.limit).toBe(12);
  });
});

describeDb("clientAddress", () => {
  it("takes the leftmost entry of x-forwarded-for", () => {
    const request = new Request("https://locora.test/api/auth/login", {
      headers: { "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" },
    });
    expect(clientAddress(request)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then to a constant", () => {
    expect(
      clientAddress(new Request("https://locora.test/", { headers: { "x-real-ip": "198.51.100.4" } })),
    ).toBe("198.51.100.4");

    // No header at all still produces a usable key, so the limit applies rather
    // than silently disappearing.
    expect(clientAddress(new Request("https://locora.test/"))).toBe("unknown");
  });
});
