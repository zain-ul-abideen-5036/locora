import { forgotPasswordSchema } from "@/lib/validation/auth";
import { requestPasswordReset } from "@/server/auth/service";
import { jsonResponse, parseWith, readJson, route } from "@/server/http/handler";
import { clientAddress, enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

/**
 * Starts a password reset.
 *
 * Always reports the same thing, whether or not the address has an account.
 * Anything else turns this into an account-enumeration endpoint, and on a
 * platform holding missing-person cases the mere fact that somebody has an
 * account here is information worth protecting.
 */
export const POST = route(async (request) => {
  await enforceRateLimit(RATE_LIMITS.passwordReset, clientAddress(request));

  const { email } = parseWith(forgotPasswordSchema, await readJson(request));
  await requestPasswordReset(email);

  return jsonResponse({
    ok: true,
    message: "If that address has a Locora account, a reset link is on its way.",
  });
});
