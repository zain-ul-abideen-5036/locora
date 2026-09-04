import { foundReportSchema } from "@/lib/validation/reports";
import { requireVerifiedUser } from "@/server/auth/current-user";
import { createFoundReport } from "@/server/reports/service";
import { jsonResponse, parseWith, readJson, route } from "@/server/http/handler";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

export const POST = route(async (request) => {
  const user = await requireVerifiedUser();
  await enforceRateLimit(RATE_LIMITS.reportCreate, user.id);

  const input = parseWith(foundReportSchema, await readJson(request));
  const { id } = await createFoundReport(user, input);

  return jsonResponse({ id, kind: "found" }, 201);
});
