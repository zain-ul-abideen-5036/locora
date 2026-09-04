"use client";

/**
 * The photographs on a case page.
 *
 * ## Why a lightbox at all
 *
 * On this product a photograph is not illustration — it is the single piece of
 * information most likely to make somebody say "I have seen that person". A
 * 400px thumbnail is not enough to be sure, so it has to be openable at full
 * size, and it has to be possible to move between several without closing and
 * reopening.
 *
 * Built on the native `<dialog>`, for the same reasons as ui/dialog.tsx: focus
 * containment, the top layer and an inert background from the platform rather
 * than from a hand-rolled focus trap.
 *
 * Arrow keys move between photographs while it is open, which is what anybody
 * who has used an image viewer expects and what keeps it usable without a
 * mouse.
 */

import { ChevronLeft, ChevronRight, ImageOff, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

export interface GalleryPhoto {
  id: string;
  url: string;
}

export function PhotoGallery({
  photos,
  personLabel,
}: {
  photos: GalleryPhoto[];
  /** Used in alternative text, e.g. "Aisha Khan" or "an unidentified person". */
  personLabel: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const open = lightboxIndex !== null;

  const step = useCallback(
    (delta: number) => {
      setLightboxIndex((current) => {
        if (current === null) return current;
        // Wraps, so holding an arrow key at either end keeps working rather
        // than appearing to have stopped responding.
        return (current + delta + photos.length) % photos.length;
      });
    },
    [photos.length],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      openerRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      document.body.style.overflow = "hidden";
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (open) return;
    document.body.style.overflow = "";
    openerRef.current?.focus();
    openerRef.current = null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, step]);

  useEffect(
    () => () => {
      document.body.style.overflow = "";
    },
    [],
  );

  if (photos.length === 0) {
    return (
      <div className="flex aspect-4/3 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface-sunken text-ink-subtle">
        <ImageOff aria-hidden className="size-7" />
        <p className="text-sm">No photograph on this case</p>
        <p className="max-w-[16rem] text-center text-xs leading-relaxed">
          Not every report has one. For a found person, publishing a photograph is sometimes not the
          safe choice.
        </p>
      </div>
    );
  }

  const active = photos[activeIndex] ?? photos[0];
  const lightboxPhoto = lightboxIndex !== null ? photos[lightboxIndex] : undefined;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setLightboxIndex(activeIndex)}
        className="group relative block aspect-4/3 w-full overflow-hidden rounded-xl border border-line bg-surface-sunken"
        aria-label={`Open the photograph of ${personLabel} at full size`}
      >
        {active ? (
          <Image
            src={active.url}
            alt={`Photograph of ${personLabel}`}
            fill
            sizes="(min-width: 1024px) 40vw, 92vw"
            // The main photograph on a case page is the reason the page exists,
            // so it is fetched eagerly rather than lazily.
            priority
            className="object-cover"
          />
        ) : null}
        <span className="pointer-events-none absolute inset-0 bg-ink/0 transition-colors group-hover:bg-ink/5" />
      </button>

      {photos.length > 1 ? (
        <ul className="flex flex-wrap gap-2">
          {photos.map((photo, index) => (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-pressed={index === activeIndex}
                aria-label={`Show photograph ${index + 1} of ${photos.length}`}
                className={cn(
                  "relative size-16 overflow-hidden rounded-md border-2 transition-colors",
                  index === activeIndex
                    ? "border-accent"
                    : "border-line hover:border-line-strong",
                )}
              >
                <Image
                  src={photo.url}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <dialog
        ref={dialogRef}
        onClick={(event) => {
          if (event.target === dialogRef.current) setLightboxIndex(null);
        }}
        onCancel={(event) => {
          event.preventDefault();
          setLightboxIndex(null);
        }}
        onClose={() => setLightboxIndex(null)}
        aria-label={`Photograph of ${personLabel}`}
        className="m-auto max-h-[92vh] max-w-[92vw] bg-transparent p-0 backdrop:bg-ink/85"
      >
        {lightboxPhoto ? (
          <div className="relative flex items-center justify-center">
            {/* Intrinsically sized rather than `fill`, so a portrait photograph
                is not cropped to a landscape box in the one view whose purpose
                is seeing the whole face. */}
            <Image
              src={lightboxPhoto.url}
              alt={`Photograph of ${personLabel}`}
              width={1400}
              height={1400}
              sizes="92vw"
              className="max-h-[92vh] w-auto object-contain"
            />

            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              aria-label="Close"
              className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-ink/60 text-white backdrop-blur-sm transition-colors hover:bg-ink/80"
            >
              <X aria-hidden className="size-4" />
            </button>

            {photos.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label="Previous photograph"
                  className="absolute left-2 flex size-10 items-center justify-center rounded-full bg-ink/60 text-white backdrop-blur-sm transition-colors hover:bg-ink/80"
                >
                  <ChevronLeft aria-hidden className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label="Next photograph"
                  className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink/60 text-white backdrop-blur-sm transition-colors hover:bg-ink/80"
                >
                  <ChevronRight aria-hidden className="size-5" />
                </button>
                <p
                  aria-live="polite"
                  className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-ink/60 px-3 py-1 text-xs text-white backdrop-blur-sm"
                  data-numeric
                >
                  {(lightboxIndex ?? 0) + 1} of {photos.length}
                </p>
              </>
            ) : null}
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
