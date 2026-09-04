import { requireAdmin } from "@/server/auth/current-user";
import { listUsers } from "@/server/admin/users";
import { jsonResponse, route, searchParamsToObject } from "@/server/http/handler";

/** Account search, for the console's user table. */
export const GET = route(async (request) => {
  await requireAdmin();
  const params = searchParamsToObject(request.url);

  return jsonResponse(
    await listUsers({
      search: params.q,
      limit: Number(params.limit ?? 50),
      offset: Number(params.offset ?? 0),
    }),
  );
});
