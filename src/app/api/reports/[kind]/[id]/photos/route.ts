import type { ReportKind } from "@/db/enums";
import { requireUser } from "@/server/auth/current-user";
import { badRequest } from "@/server/http/errors";
import { jsonResponse, route } from "@/server/http/handler";
import { addPhotos, type IncomingFile } from "@/server/reports/service";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { MAX_UPLOAD_REQUEST_BYTES } from "@/server/storage/images";

/**
 * Attaches photographs to a case.
 *
 * The Content-Length check happens before the body is read. `formData()` buffers
 * the whole request into memory to parse it, so checking the size afterwards is
 * checking after the damage — a handful of concurrent multi-gigabyte uploads
 * would exhaust the function's memory before any application code got a say.
 * The header is client-supplied and therefore only an early exit, not the real
 * limit; the per-file and per-request byte checks in the service layer are.
 */
export const POST = route<{ kind: string; id: string }>(async (request, context) => {
  const user = await requireUser();
  const { kind, id } = await context.params;

  if (kind !== "missing" && kind !== "found") {
    throw badRequest("A case is either missing or found.");
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_REQUEST_BYTES) {
    throw badRequest(
      `That is more than ${Math.floor(MAX_UPLOAD_REQUEST_BYTES / (1024 * 1024))}MB in one go. Upload a few at a time.`,
    );
  }

  await enforceRateLimit(RATE_LIMITS.photoUpload, user.id);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw badRequest("That upload could not be read. Please try again.");
  }

  const files: IncomingFile[] = [];
  for (const entry of form.getAll("photos")) {
    if (typeof entry === "string") continue;
    files.push({
      data: Buffer.from(await entry.arrayBuffer()),
      // Recorded, but only ever used to tell the uploader their file is not
      // what they said it was. The stored type comes from sniffing the bytes.
      declaredType: entry.type || null,
    });
  }

  const outcome = await addPhotos(kind as ReportKind, id, user, files);
  return jsonResponse(outcome, 201);
});
