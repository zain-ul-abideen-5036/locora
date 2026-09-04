import { sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { getCurrentUser } from "@/server/auth/current-user";
import { purgeExpiredRefreshTokens } from "@/server/auth/session";
import { purgeExpiredTokens } from "@/server/auth/verification-tokens";
import { assertProductionConfig, env } from "@/server/config/env";
import { emailDeliveryConfigured } from "@/server/email/mailer";
import { jsonResponse, route } from "@/server/http/handler";
import { logger } from "@/server/observability/logger";
import { purgeExpiredRateLimits } from "@/server/security/rate-limit";
import { storageConfigured } from "@/server/storage/blob";

/**
 * Liveness and readiness.
 *
 * ## Two levels of detail
 *
 * An anonymous caller gets `{status}` and nothing else. Which subsystems are
 * configured, and which are misconfigured, is a map of where to push — "email
 * is not configured" tells an attacker that password-reset notices are not
 * being delivered and nobody will be alerted. Signed-in reviewers get the
 * detail, because they are the people who need to act on it.
 *
 * ## Housekeeping
 *
 * Expired refresh tokens, spent verification tokens and closed rate-limit
 * windows are purged here, opportunistically. A revoked refresh-token row has
 * to outlive its token for reuse detection to work, but not forever. Doing it
 * on this endpoint means the deployment needs no scheduled job configured to
 * stay tidy — an uptime monitor pinging it, which a production deployment will
 * have anyway, is enough.
 */
export const GET = route(async () => {
  const startedAt = Date.now();
  const [user] = await Promise.all([getCurrentUser()]);
  const isReviewer = user?.role === "admin";

  let databaseOk = false;
  let databaseLatencyMs: number | null = null;
  try {
    const probeStartedAt = Date.now();
    await getDb().execute(sql`SELECT 1`);
    databaseLatencyMs = Date.now() - probeStartedAt;
    databaseOk = true;
  } catch (error) {
    logger.error("Health check: database unreachable", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  let configProblem: string | null = null;
  try {
    assertProductionConfig();
  } catch (error) {
    configProblem = error instanceof Error ? error.message : String(error);
  }

  const status = databaseOk && !configProblem ? "ok" : "degraded";

  if (databaseOk) void housekeeping();

  if (!isReviewer) {
    // Deliberately terse. 200 either way so an uptime monitor distinguishes
    // "the application is serving" from "the application is healthy" by reading
    // the body, and a transient degraded state does not page anybody at 3am.
    return jsonResponse({ status });
  }

  return jsonResponse({
    status,
    checkedInMs: Date.now() - startedAt,
    environment: env.isProduction ? "production" : env.nodeEnv,
    database: { ok: databaseOk, latencyMs: databaseLatencyMs },
    emailDelivery: emailDeliveryConfigured() ? "smtp" : "console (not delivering)",
    photoStorage: storageConfigured() ? "configured" : "not configured",
    configProblem,
  });
});

/**
 * Runs the purges without holding up the response.
 *
 * Failures are logged and swallowed: this is tidying, and it must never be the
 * reason a health check reports a problem.
 */
async function housekeeping(): Promise<void> {
  try {
    const db = getDb();
    const [refreshTokens, verificationTokens, rateLimits] = await Promise.all([
      purgeExpiredRefreshTokens(db),
      purgeExpiredTokens(db),
      purgeExpiredRateLimits(),
    ]);
    if (refreshTokens + verificationTokens + rateLimits > 0) {
      logger.info("Housekeeping removed expired rows", {
        refreshTokens,
        verificationTokens,
        rateLimits,
      });
    }
  } catch (error) {
    logger.warn("Housekeeping failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
