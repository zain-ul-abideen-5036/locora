import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * A bounded surface.
 *
 * Border *and* a small shadow, rather than one or the other. A border alone
 * reads flat; a shadow alone disappears in dark mode, where there is no light
 * for an object to cast one against. So the border defines the edge in dark and
 * the shadow lifts it in light, and one component works in both.
 */
export function Card({
  className,
  interactive = false,
  ...rest
}: { interactive?: boolean } & ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface shadow-xs",
        interactive &&
          "transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <h2 className="font-display text-lg font-semibold tracking-tight text-ink">{title}</h2>
        {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cn("px-5 py-4", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-t border-line bg-surface-sunken px-5 py-3",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * A label/value pair, for the detail panels on a case page.
 *
 * A description list rather than a grid of divs, so assistive technology reads
 * "Last seen, 3 August 2026" as a pair instead of two unrelated strings.
 */
export function DetailList({ className, ...rest }: ComponentProps<"dl">) {
  return <dl className={cn("grid gap-x-6 gap-y-4 sm:grid-cols-2", className)} {...rest} />;
}

export function Detail({
  label,
  children,
  wide = false,
}: {
  label: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2")}>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</dt>
      <dd className="mt-1 text-base break-words text-ink">{children}</dd>
    </div>
  );
}
