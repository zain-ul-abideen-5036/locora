"use client";

/**
 * Form controls.
 *
 * The accessibility work here is the point of the module, and it is the part
 * that is invariably skipped when inputs are written inline page by page:
 *
 * - Every control has a real `<label for>`, not a placeholder standing in for
 *   one. A placeholder vanishes the moment somebody types, which leaves anyone
 *   who was relying on it — including a person filling in twenty fields about
 *   their missing child — unable to check what they are answering.
 * - An error is linked by `aria-describedby` and marked `aria-invalid`, so a
 *   screen reader announces the problem when focus reaches the field rather
 *   than leaving the user to hunt for red text.
 * - The error message is in a live region, so it is announced when it appears
 *   after a failed submit, not only when focus lands.
 * - Hints are also linked by `aria-describedby`. An unlinked hint next to a
 *   field simply does not exist for a screen-reader user.
 *
 * `useId` generates the ids, so a caller never has to invent unique ones and
 * two instances of the same field on one page cannot collide.
 */

import { AlertCircle } from "lucide-react";
import { type ComponentProps, type ReactNode, useId } from "react";

import { cn } from "@/lib/cn";

interface FieldProps {
  label: string;
  /** Guidance shown under the label, before the control. */
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** Receives the ids it must wire onto the control. */
  children: (props: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean | undefined;
    "aria-required": boolean | undefined;
  }) => ReactNode;
  className?: string;
}

export function Field({ label, hint, error, required, children, className }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {required ? (
          <span className="ml-1 text-critical" aria-hidden>
            *
          </span>
        ) : (
          <span className="ml-2 text-xs font-normal text-ink-subtle">Optional</span>
        )}
      </label>

      {hint ? (
        <p id={hintId} className="text-xs leading-relaxed text-ink-muted">
          {hint}
        </p>
      ) : null}

      {children({
        id,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error ? true : undefined,
        "aria-required": required || undefined,
      })}

      {/* Reserved live region: present in the DOM whether or not there is an
          error, because a region that appears at the same moment as its content
          is frequently missed by screen readers. */}
      <div aria-live="polite" className="min-h-0">
        {error ? (
          <p id={errorId} className="flex items-start gap-1.5 text-xs font-medium text-critical">
            <AlertCircle aria-hidden className="mt-px size-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

const controlBase = cn(
  "block w-full rounded-md border bg-surface px-3 text-ink",
  "transition-[border-color,box-shadow] duration-150",
  "placeholder:text-ink-subtle",
  // The focus ring is drawn as a box-shadow so it follows the rounded corner
  // exactly, which an outline does not.
  "focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]",
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle",
  "aria-[invalid=true]:border-critical aria-[invalid=true]:focus:shadow-[0_0_0_3px_var(--critical-soft)]",
);

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cn(controlBase, "h-10", className)} {...rest} />;
}

export function Textarea({ className, rows = 4, ...rest }: ComponentProps<"textarea">) {
  return <textarea rows={rows} className={cn(controlBase, "py-2 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          controlBase,
          "h-10 appearance-none pr-9",
          // The native arrow is removed and replaced, because its appearance is
          // dictated by the OS and cannot be made to match the theme.
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      >
        <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/**
 * A checkbox with its label, as one control.
 *
 * The whole row is the label, so the hit target is the text as well as the box
 * — a 16px checkbox on a touchscreen is well under the 24px minimum that makes
 * a target reliably tappable.
 */
export function Checkbox({
  label,
  hint,
  className,
  ...rest
}: { label: ReactNode; hint?: ReactNode } & ComponentProps<"input">) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <div className={cn("flex gap-2.5", className)}>
      <input
        id={id}
        type="checkbox"
        aria-describedby={hint ? hintId : undefined}
        className={cn(
          "mt-0.5 size-4 shrink-0 rounded-xs border-line-strong text-accent",
          "focus:outline-none focus:shadow-[0_0_0_3px_var(--accent-soft)]",
        )}
        {...rest}
      />
      <div className="space-y-0.5">
        <label htmlFor={id} className="block cursor-pointer text-sm text-ink">
          {label}
        </label>
        {hint ? (
          <p id={hintId} className="text-xs text-ink-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A titled group of related fields.
 *
 * A `<fieldset>` with a `<legend>`, so assistive technology announces the group
 * when focus enters it — "Contact details, Name" rather than a bare "Name"
 * three quarters of the way down a long form.
 */
export function FieldSet({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("space-y-4", className)}>
      <legend className="space-y-1">
        <span className="block font-display text-lg font-semibold text-ink">{title}</span>
        {description ? (
          <span className="block max-w-prose text-sm text-ink-muted">{description}</span>
        ) : null}
      </legend>
      {children}
    </fieldset>
  );
}
