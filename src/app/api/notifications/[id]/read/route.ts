import { requireUser } from "@/server/auth/current-user";
import { markRead } from "@/server/notifications/service";
import { jsonResponse, route } from "@/server/http/handler";

export const POST = route<{ id: string }>(async (_request, context) => {
  const user = await requireUser();
  const { id } = await context.params;
  // The user id goes into the WHERE clause, not a check afterwards — see
  // markRead. A request naming somebody else's notification updates nothing.
  await markRead(user.id, id);
  return jsonResponse({ ok: true });
});
