import { updateProfileSchema } from "@/lib/validation/auth";
import { requireUser } from "@/server/auth/current-user";
import { updateProfile } from "@/server/auth/service";
import { jsonResponse, parseWith, readJson, route } from "@/server/http/handler";

/** Updates the caller's own display name. Scoped to the session — there is no
 *  path here that can name another account. */
export const PATCH = route(async (request) => {
  const user = await requireUser();
  const input = parseWith(updateProfileSchema, await readJson(request));
  await updateProfile(user, input);
  return jsonResponse({ ok: true });
});
