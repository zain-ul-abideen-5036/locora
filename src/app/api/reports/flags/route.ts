import { abuseReportSchema } from "@/lib/validation/reports";
import { requireUser } from "@/server/auth/current-user";
import { fileAbuseReport } from "@/server/reports/service";
import { jsonResponse, parseWith, readJson, route } from "@/server/http/handler";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

/**
 * Flags a case for review.
 *
 * Requires a session — anonymous flagging would be a free tool for burying a
 * genuine report under complaints, and there would be nobody to hold
 * accountable for it.
 */
export const POST = route(async (request) => {
  const user = await requireUser();
  await enforceRateLimit(RATE_LIMITS.abuseReport, user.id);

  const input = parseWith(abuseReportSchema, await readJson(request));
  const { id } = await fileAbuseReport(user, {
    missingReportId: input.missingReportId,
    foundReportId: input.foundReportId,
    reason: input.reason,
    details: input.details,
  });

  return jsonResponse({ id }, 201);
});
