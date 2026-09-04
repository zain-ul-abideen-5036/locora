"use client";

/**
 * Choosing photographs, before the report exists.
 *
 * ## Why files are held rather than uploaded immediately
 *
 * A photograph belongs to a report, and the report does not have an id until it
 * is filed. Uploading first would mean either inventing an id client-side or
 * keeping orphaned objects for every abandoned draft. So the files are held in
 * component state, and the page uploads them straight after the report is
 * created — see the report forms.
 *
 * ## The validation here is a courtesy
 *
 * Type and size are checked before anything leaves the browser purely so
 * somebody who picked a 40MB HEIC from their phone is told immediately rather
 * than after a slow upload. The real check reads the file's magic bytes
 * server-side and ignores whatever the browser claimed — see
 * src/server/storage/images.ts. Nothing in this file is trusted.
 *
 * ## Object URLs are revoked
 *
 * Each preview is an `URL.createObjectURL` handle, and every one is revoked
 * when its file is removed or the component unmounts. Without that, choosing
 * and re-choosing photographs leaks the full decoded image into memory each
 * time — which on a phone, on a form somebody is filling in under stress, is
 * how the tab dies mid-report.
 */

import { ImagePlus, Trash2, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { ALLOWED_IMAGE_TYPES, MAX_PHOTO_BYTES, MAX_PHOTOS_PER_REPORT } from "@/server/storage/images";

export interface PendingPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

const ACCEPT = ALLOWED_IMAGE_TYPES.join(",");
const MAX_MB = Math.floor(MAX_PHOTO_BYTES / (1024 * 1024));

export function PhotoUpload({
  photos,
  onChange,
  label = "Photographs",
  hint,
}: {
  photos: PendingPhoto[];
  onChange: (photos: PendingPhoto[]) => void;
  label?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [rejections, setRejections] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  /**
   * Revokes every remaining preview handle on unmount.
   *
   * The list is mirrored into a ref rather than closed over, so the unmount
   * cleanup does not re-run — and revoke handles that are still on screen — on
   * every change. The mirror is written in its own effect rather than during
   * render: a ref assignment during render is not safe under concurrent
   * rendering, where a render can be abandoned after the write.
   */
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(
    () => () => {
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.previewUrl);
    },
    [],
  );

  const accept = useCallback(
    (incoming: FileList | null) => {
      if (!incoming || incoming.length === 0) return;

      const problems: string[] = [];
      const accepted: PendingPhoto[] = [];
      let remaining = MAX_PHOTOS_PER_REPORT - photos.length;

      for (const file of Array.from(incoming)) {
        if (remaining <= 0) {
          problems.push(`${file.name} — a report can hold ${MAX_PHOTOS_PER_REPORT} photographs.`);
          continue;
        }
        if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
          problems.push(`${file.name} — only JPEG, PNG and WebP images can be used.`);
          continue;
        }
        if (file.size > MAX_PHOTO_BYTES) {
          problems.push(`${file.name} — larger than ${MAX_MB}MB.`);
          continue;
        }

        accepted.push({
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
        });
        remaining -= 1;
      }

      setRejections(problems);
      if (accepted.length > 0) onChange([...photos, ...accepted]);

      // Cleared so re-picking the same file fires a change event. Without this,
      // removing a photograph and choosing it again silently does nothing.
      if (inputRef.current) inputRef.current.value = "";
    },
    [onChange, photos],
  );

  function remove(id: string) {
    const target = photos.find((photo) => photo.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChange(photos.filter((photo) => photo.id !== id));
    setRejections([]);
  }

  const full = photos.length >= MAX_PHOTOS_PER_REPORT;

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={inputId} className="block text-sm font-medium text-ink">
          {label}
          <span className="ml-2 text-xs font-normal text-ink-subtle">
            Up to {MAX_PHOTOS_PER_REPORT}, {MAX_MB}MB each
          </span>
        </label>
        {hint ? <p className="mt-1 text-xs leading-relaxed text-ink-muted">{hint}</p> : null}
      </div>

      {/*
        A label wrapping a hidden file input, not a div with a click handler.
        The native control keeps keyboard access, the OS file picker and the
        screen-reader announcement ("Photographs, button") for free, and drag
        and drop is added on top rather than replacing it.
      */}
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!full) accept(event.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
          dragging ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong",
          full && "cursor-not-allowed opacity-60",
        )}
      >
        <ImagePlus aria-hidden className="size-6 text-ink-subtle" />
        <span className="text-sm font-medium text-ink">
          {full ? "Maximum photographs added" : "Choose photographs or drag them here"}
        </span>
        <span className="text-xs text-ink-muted">JPEG, PNG or WebP</span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT}
          multiple
          disabled={full}
          onChange={(event) => accept(event.target.files)}
          className="sr-only"
        />
      </label>

      {/* A live region, so a rejected file is announced rather than silently
          appearing as red text somebody has to notice. */}
      <div aria-live="polite">
        {rejections.length > 0 ? (
          <ul className="space-y-1 rounded-lg border border-critical/30 bg-critical-soft px-3 py-2">
            {rejections.map((problem) => (
              <li key={problem} className="flex items-start gap-2 text-xs text-critical-fg">
                <TriangleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />
                {problem}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {photos.map((photo, index) => (
            <li key={photo.id} className="group relative">
              <div className="relative aspect-square overflow-hidden rounded-lg border border-line bg-surface-sunken">
                {/*
                  A plain <img>, not next/image. The source is a blob: URL for a
                  file that exists only in this browser — there is nothing for an
                  image optimiser to fetch, resize or cache, and next/image would
                  refuse the protocol.
                */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.previewUrl}
                  alt={`Photograph ${index + 1}: ${photo.file.name}`}
                  className="size-full object-cover"
                />
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => remove(photo.id)}
                aria-label={`Remove ${photo.file.name}`}
                className="absolute -right-1.5 -top-1.5 size-7 rounded-full px-0"
              >
                <Trash2 aria-hidden className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Uploads the held files against a report that now exists.
 *
 * Returns the number stored and any per-file refusals from the server. Called
 * by the report forms immediately after the report is created.
 *
 * A failure here does not fail the report. The report has already been filed
 * and is in the queue; losing the photographs is a setback the reporter can fix
 * from the case page, whereas discarding the filing because an upload failed
 * would mean re-typing everything about a missing relative.
 */
export async function uploadPendingPhotos(
  kind: "missing" | "found",
  reportId: string,
  photos: PendingPhoto[],
): Promise<{ added: number; rejected: { index: number; reason: string }[] }> {
  if (photos.length === 0) return { added: 0, rejected: [] };

  const body = new FormData();
  for (const photo of photos) body.append("photos", photo.file, photo.file.name);

  const { apiFetch } = await import("@/lib/api-client");
  return apiFetch<{ added: number; rejected: { index: number; reason: string }[] }>(
    `/api/reports/${kind}/${reportId}/photos`,
    { method: "POST", body },
  );
}
