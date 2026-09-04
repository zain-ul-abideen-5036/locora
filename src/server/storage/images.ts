/**
 * Upload validation.
 *
 * ## Why the declared type is ignored
 *
 * `Content-Type` on an upload is supplied by the client and is therefore worth
 * nothing on its own. A file named `photo.png`, declared `image/png` and
 * containing `<script>…` would be stored and then served back — and while
 * Vercel Blob serves from its own hostname rather than ours, the report page
 * still renders that URL, and any future move to a same-origin proxy or a
 * custom domain would turn it into stored cross-site scripting against every
 * visitor who opens the case. Reading the actual magic number is what makes the
 * declared type mean anything.
 *
 * The sniffed type is also what gets stored and re-served, not the declared
 * one, so the two can never disagree after the fact.
 *
 * ## Why the size is checked twice
 *
 * Here, and again as a total across the whole request in the route handler. A
 * per-file limit alone lets ten files of the maximum size through in one
 * request; a per-request limit alone lets one enormous file through if the
 * count is low.
 */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_PHOTOS_PER_REPORT = 5;
/** The cap on one multipart request, enforced before any file is read. */
export const MAX_UPLOAD_REQUEST_BYTES = 5 * MAX_PHOTO_BYTES;

const EXTENSION_FOR_TYPE: Record<AllowedImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Written as hex so no byte can be mangled by an editor or an encoding change.
const PNG_MAGIC = Buffer.from("89504e470d0a1a0a", "hex");
const JPEG_MAGIC = Buffer.from("ffd8ff", "hex");
const RIFF_MAGIC = Buffer.from("52494646", "hex"); // "RIFF"
const WEBP_MARKER = Buffer.from("57454250", "hex"); // "WEBP"

/** The type these bytes actually are, or null if they are not a supported image. */
export function sniffImageType(data: Buffer): AllowedImageType | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(PNG_MAGIC)) return "image/png";
  if (data.length >= 3 && data.subarray(0, 3).equals(JPEG_MAGIC)) return "image/jpeg";
  // WebP is a RIFF container: "RIFF", four little-endian length bytes, "WEBP".
  if (
    data.length >= 12 &&
    data.subarray(0, 4).equals(RIFF_MAGIC) &&
    data.subarray(8, 12).equals(WEBP_MARKER)
  ) {
    return "image/webp";
  }
  return null;
}

export type ValidationFailure = { ok: false; reason: string };
export type ValidationSuccess = { ok: true; contentType: AllowedImageType; extension: string };
export type ValidationResult = ValidationSuccess | ValidationFailure;

export function validateImage(data: Buffer, declaredType: string | null | undefined): ValidationResult {
  if (data.length === 0) {
    return { ok: false, reason: "That file is empty." };
  }
  if (data.length > MAX_PHOTO_BYTES) {
    return {
      ok: false,
      reason: `Photos must be under ${Math.floor(MAX_PHOTO_BYTES / (1024 * 1024))}MB. Try a smaller version.`,
    };
  }

  const sniffed = sniffImageType(data);
  if (!sniffed) {
    return { ok: false, reason: "That file is not a JPEG, PNG or WebP image." };
  }

  // A mismatch is reported rather than quietly accepted. It is usually a
  // renamed file — someone changing .heic to .jpg by hand — and telling them
  // that is far more useful than accepting the bytes and leaving them to wonder
  // why the photo looks wrong.
  if (declaredType && declaredType !== sniffed) {
    return {
      ok: false,
      reason: `That file is actually a ${sniffed.replace("image/", "").toUpperCase()}, not a ${declaredType.replace("image/", "").toUpperCase()}. Re-save it and try again.`,
    };
  }

  return { ok: true, contentType: sniffed, extension: EXTENSION_FOR_TYPE[sniffed] };
}
