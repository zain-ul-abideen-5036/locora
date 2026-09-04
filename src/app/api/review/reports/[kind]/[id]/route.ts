import type { ReportKind } from "@/db/enums";
import { reviewDecisionSchema } from "@/lib/validation/reports";
import { requireAdmin } from "@/server/auth/current-user";
import { badRequest } from "@/server/http/errors";
import { jsonResponse, parseWith, readJson, route } from "@/server/http/handler";
import { reviewReport } from "@/server/reports/service";

/**
 * Moves a report through the status machine.
 *
 * PATCH with the target status in the body, rather than the status as a query
 * parameter. A state change belongs in a body: query strings end up in access
 * logs, browser history and referrer headers, and this one is a privileged
 * action on a specific case.
 */
export const PATCH = route<{ kind: string; id: string }>(async (request, context) => {
  const reviewer = await requireAdmin();
  const { kind, id } = await context.params;

  if (kind !== "missing" && kind !== "found") {
    throw badRequest("A case is either missing or found.");
  }

  const decision = parseWith(reviewDecisionSchema, await readJson(request));
  const result = await reviewReport(kind as ReportKind, id, reviewer, decision);

  return jsonResponse(result);
});
