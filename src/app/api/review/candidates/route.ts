import { requireAdmin } from "@/server/auth/current-user";
import { badRequest } from "@/server/http/errors";
import { jsonResponse, route, searchParamsToObject } from "@/server/http/handler";
import { suggestCandidates } from "@/server/matches/service";
import { uuidSchema } from "@/lib/validation/common";

/**
 * Found-person reports worth a reviewer's attention for a given missing case.
 *
 * A route rather than a server render because the comparison view fetches these
 * as the reviewer moves between cases, without a navigation.
 */
export const GET = route(async (request) => {
  await requireAdmin();

  const { missingReportId } = searchParamsToObject(request.url);
  const parsed = uuidSchema.safeParse(missingReportId);
  if (!parsed.success) throw badRequest("Provide the missing-person report id.");

  return jsonResponse({ items: await suggestCandidates(parsed.data) });
});
