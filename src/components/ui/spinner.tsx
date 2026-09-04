import { cn } from "@/lib/cn";

/**
 * An indeterminate activity indicator.
 *
 * `aria-hidden`, always. A spinner is a picture of waiting, not information —
 * the meaning belongs in a live region or a label next to it, which is what
 * every caller here provides. Announcing "image, loading spinner" adds nothing.
 *
 * Drawn with a border rather than an SVG so it costs no extra markup and
 * inherits `currentColor`, which means it is correct on any background without
 * being told.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-4 shrink-0 animate-spin rounded-full",
        "border-2 border-current border-t-transparent opacity-80",
        className,
      )}
    />
  );
}
