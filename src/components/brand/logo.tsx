import { cn } from "@/lib/cn";

/**
 * The Locora mark.
 *
 * ## The idea
 *
 * A solid point with two arcs sweeping toward it: a signal converging on a
 * location. The point is the person; the arcs are the search closing in. The
 * outer arc is deliberately open — a gap at the lower right — because on this
 * platform most cases are still open, and a closed ring would say something the
 * product cannot promise.
 *
 * ## Why it is built this way
 *
 * - **Inline SVG, not a file.** It inherits `currentColor`, so one component is
 *   correct on a light header, a dark footer and a navy button without three
 *   variants or a theme-aware `<img src>` swap. It also costs no request and
 *   cannot flash in after first paint.
 * - **Two stroke weights and one fill.** Everything holds together at 16px in a
 *   browser tab, which is the size that kills most marks: fine detail turns to
 *   grey mush, and gradients turn to a smudge.
 * - **No gradient, no drop shadow, no emoji.** Those are the three things that
 *   make a logo read as generated rather than designed.
 *
 * `aria-hidden` on the icon: the accessible name comes from the text beside it
 * in the wordmark, or from the link's own label. Announcing "Locora logo,
 * Locora" is noise.
 */
export function LocoraMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={cn("size-7", className)}
      // Kept crisp when the mark is scaled down: without this the arcs can be
      // clipped by the viewBox edge at small sizes on some renderers.
      overflow="visible"
    >
      {/* Outer sweep, open at the lower right. */}
      <path
        d="M27 16A11 11 0 1 0 22.8 24.6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Inner sweep, lighter and shorter, to give the mark depth without detail. */}
      <path
        d="M21.5 16A5.5 5.5 0 1 0 18.4 20.9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* The locus. */}
      <circle cx="16" cy="16" r="2.75" fill="currentColor" />
    </svg>
  );
}

/**
 * The mark with the name, and optionally the tagline.
 *
 * The name is set in the display serif at a tight tracking. That pairing — a
 * serif wordmark against a sans interface — is what gives Locora the register
 * of a public institution rather than a consumer app, which is the right note
 * for a service handling missing-person cases.
 */
export function LocoraWordmark({
  className,
  showTagline = false,
  size = "md",
}: {
  className?: string;
  showTagline?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: { mark: "size-6", name: "text-lg", tagline: "text-2xs" },
    md: { mark: "size-7", name: "text-xl", tagline: "text-xs" },
    lg: { mark: "size-9", name: "text-3xl", tagline: "text-sm" },
  }[size];

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LocoraMark className={cn(sizes.mark, "shrink-0 text-primary")} />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "font-display font-semibold tracking-[-0.02em] text-ink",
            sizes.name,
          )}
        >
          Locora
        </span>
        {showTagline ? (
          <span className={cn("mt-1 font-sans text-ink-muted", sizes.tagline)}>
            Find what matters.
          </span>
        ) : null}
      </span>
    </span>
  );
}
