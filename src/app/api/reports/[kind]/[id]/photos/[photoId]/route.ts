import type { ReportKind } from "@/db/enums";
import { requireUser } from "@/server/auth/current-user";
import { badRequest } from "@/server/http/errors";
import { noContent, route } from "@/server/http/handler";
import { removePhoto } from "@/server/reports/service";

export const DELETE = route<{ kind: string; id: string; photoId: string }>(
  async (_request, context) => {
    const user = await requireUser();
    const { kind, id, photoId } = await context.params;

    if (kind !== "missing" && kind !== "found") {
      throw badRequest("A case is either missing or found.");
    }

    await removePhoto(kind as ReportKind, id, photoId, user);
    return noContent();
  },
);
