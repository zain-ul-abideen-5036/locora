import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Spinner } from "./spinner";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "link";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * The one place button styling is defined.
 *
 * Exported as a function rather than baked into a component because two
 * different elements need it: a `<button>` for actions and a `<Link>` for
 * navigation. Styling a link to look like a button is fine; using a button to
 * navigate is not — it breaks middle-click, right-click, "open in new tab" and
 * the screen-reader announcement that says whether something will move you or
 * do something.
 */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(
    // Motion is on transform and colour only. Animating layout properties
    // (width, padding) causes a reflow on every frame.
    "relative inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap",
    "rounded-md transition-[color,background-color,border-color,box-shadow,transform] duration-150",
    "active:translate-y-px",
    // A disabled control keeps its cursor as a signal rather than becoming
    // invisible; opacity alone with pointer-events:none leaves no explanation.
    "disabled:pointer-events-none disabled:opacity-55",
    {
      sm: "h-8 px-3 text-sm",
      md: "h-10 px-4 text-base",
      lg: "h-12 px-6 text-lg",
    }[size],
    {
      primary:
        "bg-primary text-primary-fg shadow-xs hover:bg-primary-hover hover:shadow-sm",
      secondary:
        "border border-line-strong bg-surface text-ink shadow-xs hover:bg-surface-hover hover:border-line-strong",
      ghost: "text-ink-muted hover:bg-surface-hover hover:text-ink",
      danger: "bg-critical text-white shadow-xs hover:brightness-110",
      link: "h-auto px-0 text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent",
    }[variant],
    className,
  );
}

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the control. */
  loading?: boolean;
  /** Announced instead of the label while loading, for assistive technology. */
  loadingLabel?: string;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingLabel = "Working",
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonOwnProps & ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      // A loading button must be unclickable, or a double-submit files two
      // reports about the same person.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner className="size-4" />
          {/* The label stays rendered but hidden, so the button does not change
              width mid-submit and shift everything around it. */}
          <span className="sr-only">{loadingLabel}</span>
          <span aria-hidden className="opacity-0">
            {children}
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonOwnProps & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
