import { changePasswordSchema } from "@/lib/validation/auth";
import { requireUser } from "@/server/auth/current-user";
import { changePassword } from "@/server/auth/service";
import { jsonResponse, parseWith, readJson, route } from "@/server/http/handler";

export const POST = route(async (request) => {
  const user = await requireUser();
  const input = parseWith(changePasswordSchema, await readJson(request));
  await changePassword(user, input);
  return jsonResponse({ ok: true });
});
