"use client";

/**
 * A modal dialog, built on the native `<dialog>` element.
 *
 * Using the platform element rather than a div-based implementation is the
 * whole point of this module. `showModal()` gives, for free and correctly, the
 * four things hand-rolled modals almost always get wrong:
 *
 * - **Focus containment.** Tab cannot leave the dialog. A div-based modal needs
 *   a focus trap, and the usual implementations miss iframes, shadow roots and
 *   the browser's own UI.
 * - **The top layer.** It renders above every stacking context, so no
 *   `z-index` arms race with a sticky header.
 * - **Inert background.** Everything behind it is genuinely inert to a screen
 *   reader and to pointer events, without setting `aria-hidden` on the app root
 *   and remembering to unset it.
 * - **Escape to close**, wired to the platform's own semantics.
 *
 * What is added on top: closing on a backdrop click (the element does not do
 * this by itself), restoring focus to the element that opened it, and locking
 * background scroll.
 */

import { X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useRef } from "react";

import { cn } from "@/lib/cn";

import { Button } from "./button";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** `sm` for a confirmation, `lg` for a comparison view. */
  size?: "sm" | "md" | "lg";
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const previouslyFocused = useRef<Element | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      previouslyFocused.current = document.activeElement;
      dialog.showModal();
      // Scroll is locked on the body because the page behind a modal must not
      // move when the wheel is used over the backdrop.
      document.body.style.overflow = "hidden";
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (open) return;
    document.body.style.overflow = "";
    // Focus goes back where it came from. Without this, dismissing a dialog
    // drops a keyboard user at the top of the document and they have to tab all
    // the way back to where they were.
    if (previouslyFocused.current instanceof HTMLElement) {
      previouslyFocused.current.focus();
      previouslyFocused.current = null;
    }
  }, [open]);

  // Unmounting while open would otherwise leave the body permanently locked.
  useEffect(() => () => {
    document.body.style.overflow = "";
  }, []);

  /**
   * A click on the backdrop closes the dialog.
   *
   * The check is against the event target being the dialog itself: the backdrop
   * is `::backdrop`, which is not an event target, so a click that lands
   * "outside" the content actually lands on the dialog element. Content sits in
   * a child div, so any click within it has that div as its target instead.
   */
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      if (event.target === ref.current) onClose();
    },
    [onClose],
  );

  return (
    <dialog
      ref={ref}
      onClick={handleClick}
      // Fired by Escape as well as by close(). Routed back through onClose so
      // the parent's state cannot drift out of step with the element's.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        "m-auto w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-0 text-ink shadow-xl",
        "backdrop:bg-ink/45 backdrop:backdrop-blur-[2px]",
        "open:animate-fade-in",
        { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl" }[size],
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0 space-y-1">
          <h2 id={titleId} className="font-display text-lg font-semibold text-ink">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="text-sm text-ink-muted">
              {description}
            </p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="-mr-2 -mt-1 shrink-0 px-2"
          aria-label="Close"
        >
          <X aria-hidden className="size-4" />
        </Button>
      </div>

      {children ? (
        // Capped so a long dialog scrolls its own content rather than growing
        // past the viewport and stranding the footer buttons off-screen.
        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>
      ) : null}

      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-sunken px-5 py-3">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}

/**
 * A confirmation dialog for an action that is hard to undo.
 *
 * Used for rejecting a report, suspending an account and confirming a match —
 * each of which is visible to somebody else the moment it happens. The
 * confirming button carries the verb ("Reject report"), never "OK": a dialog
 * answered by "OK" is one people learn to dismiss without reading.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  tone = "danger",
  loading = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading} loadingLabel="Working">
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
