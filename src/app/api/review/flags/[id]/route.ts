import { requireAdmin } from "@/server/auth/current-user";
import { jsonResponse, route } from "@/server/http/handler";
import { resolveAbuseReport } from "@/server/reports/service";

export const PATCH = route<{ id: string }>(async (_request, context) => {
  const reviewer = await requireAdmin();
  const { id } = await context.params;
  await resolveAbuseReport(reviewer, id);
  return jsonResponse({ ok: true });
});
