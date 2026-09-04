import { missingReportSchema } from "@/lib/validation/reports";
import { requireVerifiedUser } from "@/server/auth/current-user";
import { createMissingReport } from "@/server/reports/service";
import { jsonResponse, parseWith, readJson, route } from "@/server/http/handler";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

/**
 * Files a missing-person report.
 *
 * There is no GET counterpart: the public feed is rendered by a Server
 * Component that calls the query layer directly (src/app/cases/page.tsx). An
 * API route for it would make the application fetch over HTTP from itself —
 * a second network hop, a second serverless invocation and a cache to
 * invalidate, to produce data the renderer could already reach.
 */
export const POST = route(async (request) => {
  const user = await requireVerifiedUser();
  await enforceRateLimit(RATE_LIMITS.reportCreate, user.id);

  const input = parseWith(missingReportSchema, await readJson(request));
  const { id } = await createMissingReport(user, input);

  return jsonResponse({ id, kind: "missing" }, 201);
});
