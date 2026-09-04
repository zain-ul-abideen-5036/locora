import { requireUser } from "@/server/auth/current-user";
import { countUnread, listForUser } from "@/server/notifications/service";
import { jsonResponse, route, searchParamsToObject } from "@/server/http/handler";

/**
 * The caller's notifications.
 *
 * A route rather than a server render because the header's bell polls it, and
 * because marking one read has to update the list without navigating.
 */
export const GET = route(async (request) => {
  const user = await requireUser();
  const params = searchParamsToObject(request.url);

  const [items, unread] = await Promise.all([
    listForUser(user.id, { unreadOnly: params.unread === "true" }),
    countUnread(user.id),
  ]);

  return jsonResponse({ items, unread });
});
