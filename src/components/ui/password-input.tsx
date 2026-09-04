"use client";

/**
 * A password field with a visibility toggle, and optionally a strength meter.
 *
 * ## The toggle
 *
 * Masking exists to defeat somebody looking over your shoulder, and it costs
 * everybody else the ability to check what they typed. A toggle gives both, and
 * it matters more than usual here: this product is used under stress, often on
 * a phone, and a mistyped password at the moment somebody is trying to file a
 * report about a missing relative is a bad time to be locked out.
 *
 * The button is a real `<button>` with an accessible name that changes with
 * state, and `aria-pressed` so a screen reader announces whether the password
 * is currently visible. It is not in the tab order after the field by accident
 * — it comes immediately after, which is where a keyboard user reaches for it.
 *
 * ## The meter
 *
 * Presentational only, and it never blocks submission. The rule is
 * `passwordSchema`, server-side; a meter that gates the form eventually rejects
 * a genuinely strong password for failing to look strong. It is also announced
 * politely rather than assertively — a strength label changing on every
 * keystroke would make a screen reader unusable.
 */

import { Eye, EyeOff } from "lucide-react";
import { type ComponentProps, useId, useState } from "react";

import { cn } from "@/lib/cn";
import { scorePassword } from "@/lib/validation/auth";

const METER_CLASSES = [
  "w-1/5 bg-critical",
  "w-2/5 bg-critical",
  "w-3/5 bg-caution",
  "w-4/5 bg-positive",
  "w-full bg-positive",
] as const;

export function PasswordInput({
  showStrength = false,
  value,
  className,
  ...rest
}: { showStrength?: boolean } & ComponentProps<"input">) {
  const [visible, setVisible] = useState(false);
  const meterId = useId();

  const password = typeof value === "string" ? value : "";
  const strength = showStrength ? scorePassword(password) : null;

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          {...rest}
          value={value}
          type={visible ? "text" : "password"}
          className={cn(
            "block h-10 w-full rounded-md border bg-surface pl-3 pr-11 text-ink",
            "transition-[border-color,box-shadow] duration-150",
            "placeholder:text-ink-subtle",
            "focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)] focus:outline-none",
            "aria-[invalid=true]:border-critical aria-[invalid=true]:focus:shadow-[0_0_0_3px_var(--critical-soft)]",
            className,
          )}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-pressed={visible}
          aria-label={visible ? "Hide password" : "Show password"}
          className={cn(
            "absolute right-1 top-1 flex size-8 items-center justify-center rounded-sm",
            "text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink-muted",
          )}
        >
          {visible ? (
            <EyeOff aria-hidden className="size-4" />
          ) : (
            <Eye aria-hidden className="size-4" />
          )}
        </button>
      </div>

      {strength && password.length > 0 ? (
        <div className="space-y-1">
          <div
            className="h-1 overflow-hidden rounded-full bg-surface-sunken"
            role="presentation"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width,background-color] duration-300",
                METER_CLASSES[strength.score],
              )}
            />
          </div>
          <p id={meterId} aria-live="polite" className="text-xs text-ink-muted">
            {strength.label}
          </p>
        </div>
      ) : null}
    </div>
  );
}
