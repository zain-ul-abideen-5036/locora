"use client";

/**
 * A sticky index of the form's sections, with what is done and what is left.
 *
 * ## Why not a wizard
 *
 * The obvious way to make a long form feel guided is to split it into steps.
 * That trade is worse than it looks here: a wizard hides how much is left,
 * loses everything on a refresh unless drafts are persisted, makes going back
 * to change one earlier answer a chore, and breaks the browser's own form
 * restoration. On a form somebody is filling in about a missing relative,
 * losing their answers is not a minor annoyance.
 *
 * This gives the thing a wizard is actually for — knowing where you are and how
 * much remains — while every answer stays on one page, visible and editable.
 *
 * ## What "done" means
 *
 * A section is marked complete when its *required* fields have values. It is
 * deliberately not a validity check: telling somebody a section is incomplete
 * because a phone number is one digit short, while they are still typing it,
 * is a form arguing with its user. Validation happens on submit, next to the
 * field, where it can be acted on.
 */

import { Check } from "lucide-react";

import { cn } from "@/lib/cn";

export interface FormSectionState {
  id: string;
  label: string;
  /** Required fields all have values. Not a validity check — see above. */
  complete: boolean;
  /** Shown when a section has no required fields at all. */
  optional?: boolean;
}

export function FormProgress({ sections }: { sections: FormSectionState[] }) {
  const required = sections.filter((section) => !section.optional);
  const done = required.filter((section) => section.complete).length;

  return (
    <nav
      aria-label="Sections of this report"
      // Sticky from lg up only. On a phone it sits above the form as a plain
      // list; a sticky element on a small screen eats the space the form needs.
      className="lg:sticky lg:top-24"
    >
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Your report</h2>
          <p className="text-xs text-ink-muted" data-numeric>
            {done} of {required.length}
          </p>
        </div>

        {/* A real progress element, so assistive technology reads it as
            progress rather than as a decorative bar. */}
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={required.length}
          aria-valuenow={done}
          aria-label="Required sections completed"
          className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-sunken"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out-quint"
            style={{ width: `${required.length === 0 ? 0 : (done / required.length) * 100}%` }}
          />
        </div>

        <ol className="mt-4 space-y-1">
          {sections.map((section, index) => (
            <li key={section.id}>
              {/*
                An anchor rather than a scroll handler: it works before
                JavaScript, is a real link in a screen reader's list, and the
                browser handles focus so the next Tab continues from the section
                jumped to rather than from the index.
              */}
              <a
                href={`#${section.id}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                  "hover:bg-surface-hover",
                  section.complete ? "text-ink" : "text-ink-muted",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-2xs font-semibold",
                    section.complete
                      ? "bg-positive-soft text-positive-fg"
                      : "bg-surface-sunken text-ink-subtle",
                  )}
                >
                  {section.complete ? <Check className="size-3" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{section.label}</span>
                {section.optional ? (
                  <span className="shrink-0 text-2xs text-ink-subtle">optional</span>
                ) : null}
                {/* The visual state is carried by colour and the tick, so the
                    same information is given in words to a screen reader. */}
                <span className="sr-only">
                  {section.optional
                    ? "optional section"
                    : section.complete
                      ? "complete"
                      : "not yet complete"}
                </span>
              </a>
            </li>
          ))}
        </ol>

        <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-subtle">
          Nothing is submitted until you press the button at the end. You can move between sections
          freely.
        </p>
      </div>
    </nav>
  );
}
