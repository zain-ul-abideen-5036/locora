import { verifyEmailSchema } from "@/lib/validation/auth";
import { confirmEmail } from "@/server/auth/service";
import { jsonResponse, parseWith, readJson, route } from "@/server/http/handler";

export const POST = route(async (request) => {
  const { token } = parseWith(verifyEmailSchema, await readJson(request));
  await confirmEmail(token);
  return jsonResponse({ ok: true });
});
