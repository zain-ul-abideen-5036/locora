import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Callout
// ---------------------------------------------------------------------------

export type CalloutTone = "info" | "success" | "warning" | "danger";

const CALLOUT_PRESENTATION: Record<
  CalloutTone,
  { container: string; icon: string; Icon: typeof Info; role: "status" | "alert" }
> = {
  info: {
    container: "border-line bg-surface-sunken",
    icon: "text-accent",
    Icon: Info,
    role: "status",
  },
  success: {
    container: "border-positive/25 bg-positive-soft",
    icon: "text-positive",
    Icon: CheckCircle2,
    role: "status",
  },
  warning: {
    container: "border-caution/30 bg-caution-soft",
    icon: "text-caution",
    Icon: AlertTriangle,
    role: "status",
  },
  danger: {
    container: "border-critical/30 bg-critical-soft",
    icon: "text-critical",
    Icon: ShieldAlert,
    // `alert` interrupts a screen reader immediately. That is right for a
    // failure the user has to act on, and deliberately not used for the other
    // three: interrupting somebody to read them a neutral note is a nuisance.
    role: "alert",
  },
};

export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const { container, icon, Icon, role } = CALLOUT_PRESENTATION[tone];

  return (
    <div role={role} className={cn("flex gap-3 rounded-lg border px-4 py-3", container, className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", icon)} />
      <div className="min-w-0 space-y-1 text-sm">
        {title ? <p className="font-semibold text-ink">{title}</p> : null}
        {children ? (
          <div className="text-ink-muted [&_a]:text-accent [&_a]:underline">{children}</div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

/**
 * A placeholder shaped like the content that is coming.
 *
 * Shaped like the real thing, not a generic grey box, because the point is that
 * nothing moves when the content arrives. A spinner in an empty region tells
 * somebody to wait; a skeleton tells them what they are waiting for and leaves
 * the layout settled.
 *
 * `aria-hidden` throughout: a screen-reader user gets the loading state from
 * the live region on the containing component, not from a description of grey
 * rectangles.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative block overflow-hidden rounded-md bg-surface-sunken",
        // A sweep, not a pulse. A pulsing block draws the eye continuously; a
        // sweep reads as progress and then recedes.
        "after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer",
        "after:bg-linear-to-r after:from-transparent after:via-surface-hover after:to-transparent",
        className,
      )}
    />
  );
}

/** Matches CaseCard's dimensions, so the grid does not reflow on load. */
export function CaseCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <Skeleton className="aspect-4/3 rounded-none" />
      <div className="space-y-2.5 p-4">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );
}

export function CaseGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      <span className="sr-only">Loading cases…</span>
      {Array.from({ length: count }, (_, index) => (
        <CaseCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function RowSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="divide-y divide-line">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

/**
 * What a list shows when it has nothing in it.
 *
 * Every empty state says two things: what happened, and what to do next. An
 * empty region with the single word "None" leaves somebody unsure whether the
 * page is broken, their filter is too narrow, or there is genuinely nothing —
 * and on this product the difference matters, because "no results" and "no
 * cases have been filed" mean very different things.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-line",
        "bg-surface px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-surface-sunken text-ink-subtle">
          {icon}
        </div>
      ) : null}
      <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
