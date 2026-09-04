import { loginSchema } from "@/lib/validation/auth";
import { signIn } from "@/server/auth/service";
import { jsonResponse, parseWith, readJson, route } from "@/server/http/handler";
import { clientAddress, enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

export const POST = route(async (request) => {
  // Keyed by address rather than by email, because keying by email lets an
  // attacker lock a specific person out of their own account by burning that
  // account's quota with deliberate failures.
  await enforceRateLimit(RATE_LIMITS.login, clientAddress(request));

  const input = parseWith(loginSchema, await readJson(request));
  const user = await signIn(input);

  return jsonResponse({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isEmailVerified: user.isEmailVerified,
  });
});
