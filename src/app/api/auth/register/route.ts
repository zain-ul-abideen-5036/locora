import { getDb } from "@/db/client";
import { registerSchema } from "@/lib/validation/auth";
import { register } from "@/server/auth/service";
import { issueSession } from "@/server/auth/session";
import { jsonResponse, parseWith, readJson, route } from "@/server/http/handler";
import { clientAddress, enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

/**
 * Creates an account and signs the new user in.
 *
 * Signing them in immediately, before the address is confirmed, is deliberate.
 * The alternative sends somebody who has just filed nothing back to a sign-in
 * form, and this is a product people reach in a bad moment — the fewer steps
 * between arriving and being able to file a report, the better. Confirmation
 * still gates *filing* (see requireVerifiedUser), so the anti-spam property is
 * kept without making the first minute hostile.
 */
export const POST = route(async (request) => {
  await enforceRateLimit(RATE_LIMITS.register, clientAddress(request));

  const input = parseWith(registerSchema, await readJson(request));
  const result = await register(input);
  await issueSession(getDb(), result.userId);

  return jsonResponse({ ok: true, emailSent: result.emailSent }, 201);
});
