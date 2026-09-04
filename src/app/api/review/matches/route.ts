import { createMatchSchema } from "@/lib/validation/reports";
import { requireAdmin } from "@/server/auth/current-user";
import { jsonResponse, parseWith, readJson, route } from "@/server/http/handler";
import { createMatch } from "@/server/matches/service";

export const POST = route(async (request) => {
  const reviewer = await requireAdmin();
  const input = parseWith(createMatchSchema, await readJson(request));

  const { id } = await createMatch(reviewer, {
    missingReportId: input.missingReportId,
    foundReportId: input.foundReportId,
    notes: input.notes,
  });

  return jsonResponse({ id }, 201);
});
