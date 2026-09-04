import { resetPasswordSchema } from "@/lib/validation/auth";
import { resetPassword } from "@/server/auth/service";
import { clearSessionCookies } from "@/server/auth/session";
import { jsonResponse, parseWith, readJson, route } from "@/server/http/handler";
import { clientAddress, enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

export const POST = route(async (request) => {
  await enforceRateLimit(RATE_LIMITS.passwordReset, clientAddress(request));

  const input = parseWith(resetPasswordSchema, await readJson(request));
  await resetPassword(input.token, input.password);

  // Every session was revoked server-side, including any this browser holds.
  // Clearing the cookies here means the user lands on the sign-in page as a
  // clean anonymous visitor rather than appearing signed in until their next
  // request fails.
  await clearSessionCookies();

  return jsonResponse({ ok: true });
});
