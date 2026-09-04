import { getCurrentUser } from "@/server/auth/current-user";
import { countUnread } from "@/server/notifications/service";
import { jsonResponse, route } from "@/server/http/handler";

/**
 * Who the caller is, for the client-side session context.
 *
 * Returns 200 with `user: null` for an anonymous visitor rather than 401.
 * A 401 here would be indistinguishable from an expired access token and would
 * make the client's silent-refresh path fire on every page load for people who
 * are simply not signed in.
 */
export const GET = route(async () => {
  const user = await getCurrentUser();
  if (!user) return jsonResponse({ user: null, unreadNotifications: 0 });

  return jsonResponse({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
    },
    unreadNotifications: await countUnread(user.id),
  });
});
