import { cookies } from "next/headers";

import { getDb } from "@/db/client";
import { clearSessionCookies, REFRESH_COOKIE, revokeSession } from "@/server/auth/session";
import { jsonResponse, route } from "@/server/http/handler";

/**
 * Signs the caller out.
 *
 * The refresh token is revoked server-side as well as having its cookie
 * cleared. Clearing the cookie alone would leave a token that is still valid
 * for seven days in whatever captured it.
 */
export const POST = route(async () => {
  const jar = await cookies();
  await revokeSession(getDb(), jar.get(REFRESH_COOKIE)?.value);
  await clearSessionCookies();
  return jsonResponse({ ok: true });
});
