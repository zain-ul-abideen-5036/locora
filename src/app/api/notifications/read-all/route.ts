import { requireUser } from "@/server/auth/current-user";
import { markAllRead } from "@/server/notifications/service";
import { jsonResponse, route } from "@/server/http/handler";

export const POST = route(async () => {
  const user = await requireUser();
  const count = await markAllRead(user.id);
  return jsonResponse({ ok: true, marked: count });
});
