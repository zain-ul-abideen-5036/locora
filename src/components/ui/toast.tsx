"use client";

/**
 * Transient confirmations.
 *
 * Toasts carry only the news that something the user just did has succeeded or
 * failed. They are the wrong place for anything that must be read: a message
 * that disappears after five seconds cannot be a requirement, and somebody
 * using a screen magnifier may never see a corner of the viewport at all. So
 * validation errors live next to their field, and blocking problems live in a
 * `Callout` on the page. Nothing here is the only copy of anything.
 *
 * The container is a live region, so the text is announced when it appears. It
 * is `polite` rather than `assertive`: a success confirmation should not
 * interrupt whatever a screen reader is in the middle of saying.
 */

import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DISMISS_AFTER_MS = 6000;
/** Beyond a handful the stack becomes a wall that hides the page. */
const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Tracked so every pending timer can be cleared on unmount; a timer firing
  // after the provider is gone is a setState on an unmounted tree.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current.slice(-(MAX_VISIBLE - 1)), { id, tone, message }]);

      const timer = setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (message: string) => toast(message, "success"),
      error: (message: string) => toast(message, "error"),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        // `aria-live` on the container, not on each toast: a live region has to
        // already be in the accessibility tree when its content changes, or the
        // change is frequently not announced at all.
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((entry) => (
          <ToastCard key={entry.id} toast={entry} onDismiss={() => dismiss(entry.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TONE_PRESENTATION: Record<ToastTone, { className: string; Icon: typeof Info }> = {
  success: { className: "border-positive/30 bg-positive-soft text-positive-fg", Icon: CheckCircle2 },
  error: { className: "border-critical/30 bg-critical-soft text-critical-fg", Icon: AlertTriangle },
  info: { className: "border-line bg-surface text-ink", Icon: Info },
};

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { className, Icon } = TONE_PRESENTATION[toast.tone];

  return (
    <div
      className={cn(
        // `pointer-events-auto` because the container is `pointer-events-none`
        // — otherwise the stack would swallow clicks on the page beneath it
        // across the full width of the viewport.
        "pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border px-3.5 py-3 shadow-lg",
        "animate-fade-up",
        className,
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0 flex-1 text-sm font-medium">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mr-1 -mt-0.5 rounded-xs p-1 opacity-60 transition-opacity hover:opacity-100"
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside a ToastProvider");
  return context;
}
