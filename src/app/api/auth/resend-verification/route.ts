import { requireUser } from "@/server/auth/current-user";
import { resendConfirmation } from "@/server/auth/service";
import { jsonResponse, route } from "@/server/http/handler";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

export const POST = route(async () => {
  const user = await requireUser();
  // Keyed by user id: this endpoint needs a session, so there is a better
  // subject available than an IP address.
  await enforceRateLimit(RATE_LIMITS.emailResend, user.id);

  const sent = await resendConfirmation(user);
  return jsonResponse({ ok: true, emailSent: sent });
});
