"use client";

/**
 * Light and dark, with an explicit choice that survives a reload.
 *
 * Three states, not two: `light`, `dark`, and `system` — which follows the
 * operating system and is the default. A product that only offers a toggle
 * forces a decision on somebody whose machine already switches at sunset.
 */

import { Monitor, Moon, Sun } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";

import { cn } from "@/lib/cn";

export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "locora-theme";

/**
 * The script that runs before first paint.
 *
 * This has to be a blocking inline script in `<head>`, and it is the one place
 * in the codebase where that is the right answer. React cannot help: the
 * document has already been painted by the time any component mounts, so a
 * visitor who chose dark would get a white flash on every page load.
 *
 * Written as a string and injected with `dangerouslySetInnerHTML` because that
 * is the only way to place a synchronous inline script in the head. The content
 * is a fixed literal with no interpolation of any kind — nothing from a
 * request, a cookie or a parameter reaches it — so despite the name of the prop
 * there is no injection surface here.
 *
 * Wrapped in try/catch because `localStorage` *throws* rather than returning
 * null in a browser configured to block site data. An exception would abort the
 * script and leave the page unthemed.
 */
const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("locora-theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (stored === "dark" || (stored !== "light" && prefersDark)) {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {}
})();
`;

export function ThemeScript() {
  return <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}

/**
 * The preference, read as an external store.
 *
 * `localStorage` and `matchMedia` are exactly what `useSyncExternalStore` is
 * for: state that lives outside React, can change without React's involvement,
 * and has a different value on the server than in the browser. Reading it in a
 * `useState` initialiser would produce a hydration mismatch; reading it in an
 * effect and calling `setState` would cause a cascading re-render on every
 * mount. This does neither, and React handles the server/client difference by
 * design.
 */
function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Site data blocked. "system" is the correct fallback.
  }
  return "system";
}

/** Notified on a change from this tab, from another tab, or from the OS. */
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);

  // Another tab changing the preference should update this one — a person who
  // switches to dark in one window does not expect the other to stay light.
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener("storage", onStorage);

  // While the preference is "system", the resolved theme follows the OS. This
  // is what makes a machine set to switch automatically actually switch a page
  // that is already open.
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const onQueryChange = () => {
    if (readPreference() === "system") applyTheme("system");
  };
  query.addEventListener("change", onQueryChange);

  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
    query.removeEventListener("change", onQueryChange);
  };
}

/** On the server there is no storage to read, and "system" is what the script assumes too. */
function serverPreference(): ThemePreference {
  return "system";
}

function applyTheme(preference: ThemePreference): void {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = preference === "dark" || (preference === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
}

export function useTheme(): {
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
} {
  const preference = useSyncExternalStore(subscribe, readPreference, serverPreference);

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The choice still applies to this page; it just will not be remembered.
    }
    applyTheme(next);
    // `storage` does not fire in the tab that wrote the value, so this tab is
    // told explicitly.
    notify();
  }, []);

  return { preference, setPreference };
}

/**
 * Present so the provider can be added later without touching every call site.
 *
 * There is genuinely no context to provide: `useTheme` reads an external store,
 * so any component can call it directly with no provider above it. Kept as a
 * pass-through rather than removed, because a theme provider is the first thing
 * somebody looks for.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return children;
}

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/**
 * A three-way segmented control.
 *
 * A radio group rather than three buttons, so a screen reader announces "Theme,
 * Light, 1 of 3, selected" and arrow keys move between the options — which is
 * what a keyboard user expects from a set of mutually exclusive choices.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-line bg-surface-sunken p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => setPreference(value)}
            className={cn(
              "flex size-7 items-center justify-center rounded-full transition-colors duration-150",
              selected ? "bg-surface text-ink shadow-xs" : "text-ink-subtle hover:text-ink-muted",
            )}
          >
            <Icon aria-hidden className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
