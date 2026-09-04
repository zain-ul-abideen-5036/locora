import { banUserSchema, setRoleSchema } from "@/lib/validation/reports";
import { requireAdmin } from "@/server/auth/current-user";
import { setBanned, setRole } from "@/server/admin/users";
import { badRequest } from "@/server/http/errors";
import { jsonResponse, parseWith, readJson, route } from "@/server/http/handler";

/**
 * Suspends, restores, or changes the role of an account.
 *
 * One route for both because they are the same kind of action on the same
 * resource, discriminated by which field the body carries. Sending both at once
 * is refused rather than silently applying one: "suspend this account and make
 * it a reviewer" is not a coherent request, and guessing which half was meant
 * is worse than saying so.
 */
export const PATCH = route<{ id: string }>(async (request, context) => {
  const reviewer = await requireAdmin();
  const { id } = await context.params;
  const body = await readJson(request);

  const hasBan = typeof body === "object" && body !== null && "isBanned" in body;
  const hasRole = typeof body === "object" && body !== null && "role" in body;

  if (hasBan && hasRole) {
    throw badRequest("Change the suspension or the role, not both in one request.");
  }

  if (hasBan) {
    const input = parseWith(banUserSchema, body);
    return jsonResponse(await setBanned(reviewer, id, input.isBanned, input.reason));
  }

  if (hasRole) {
    const input = parseWith(setRoleSchema, body);
    return jsonResponse(await setRole(reviewer, id, input.role));
  }

  throw badRequest("Nothing to change — send isBanned or role.");
});
