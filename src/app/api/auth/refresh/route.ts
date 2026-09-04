import { cookies } from "next/headers";

import { getDb } from "@/db/client";
import { clearSessionCookies, REFRESH_COOKIE, rotateSession } from "@/server/auth/session";
import { unauthorized } from "@/server/http/errors";
import { jsonResponse, route } from "@/server/http/handler";

/**
 * Exchanges the refresh cookie for a new token pair.
 *
 * On any failure the cookies are cleared before responding. Without that, a
 * client holding a dead refresh token retries the silent-refresh path on every
 * subsequent 401 — and if the failure was reuse detection, keeps re-triggering
 * the "revoke everything" branch.
 */
export const POST = route(async () => {
  const jar = await cookies();
  const result = await rotateSession(getDb(), jar.get(REFRESH_COOKIE)?.value);

  if (!result.ok) {
    await clearSessionCookies();
    throw unauthorized(
      result.reason === "reused"
        ? "For your security we signed you out everywhere. Please sign in again."
        : "Your session has expired. Please sign in again.",
    );
  }

  return jsonResponse({ ok: true });
});
