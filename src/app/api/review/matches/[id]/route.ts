import { matchDecisionSchema } from "@/lib/validation/reports";
import { requireAdmin } from "@/server/auth/current-user";
import { jsonResponse, parseWith, readJson, route } from "@/server/http/handler";
import { decideMatch } from "@/server/matches/service";

/** Confirms or dismisses a possible match. */
export const PATCH = route<{ id: string }>(async (request, context) => {
  const reviewer = await requireAdmin();
  const { id } = await context.params;
  const decision = parseWith(matchDecisionSchema, await readJson(request));

  const result = await decideMatch(reviewer, id, {
    status: decision.status,
    notes: decision.notes,
  });

  return jsonResponse(result);
});
