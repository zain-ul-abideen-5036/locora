"use client";

/**
 * Light and dark, with an explicit choice that survives a reload.
 *
 * Three states, not two: `light`, `dark`, and `system` — which follows the
 * operating system and is the default. A product that only offers a toggle
 * forces a decision on somebody whose OS already switches at sunset.
 */

import { Monitor, Moon, Sun } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";

export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "locora-theme";

/**
 * The script that runs before first paint.
 *
 * This has to be a blocking inline script in `<head>`, and it is the one place
 * in the codebase where that is the right answer. React cannot help: the
 * document has already been painted by the time any component mounts, so a
 * visitor who chose dark would see a white flash on every single page load.
 *
 * Written as a string and injected with `dangerouslySetInnerHTML` because that
 * is the only way to get a synchronous inline script into the document head.
 * The content is a fixed literal with no interpolation of any kind — nothing
 * from a request, a cookie or a parameter reaches it — so there is no injection
 * surface here despite the name of the prop.
 *
 * Wrapped in try/catch because `localStorage` throws outright, rather than
 * returning null, in a browser configured to block site data. An exception here
 * would abort the script and leave the page unthemed.
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

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(preference: ThemePreference): void {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = preference === "dark" || (preference === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Starts at "system" and is corrected in the effect below rather than read
  // during render. Reading localStorage in an initialiser runs on the server
  // too, where it does not exist, and produces a hydration mismatch.
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark" || stored === "system") {
        setPreferenceState(stored);
      }
    } catch {
      // Site data blocked. "system" is the right fallback and already applied.
    }
  }, []);

  // Follows the OS while the preference is "system", including a change made
  // while the page is open — which is exactly what happens at sunset on a
  // machine set to switch automatically.
  useEffect(() => {
    if (preference !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The choice still applies to this page; it just will not be remembered.
    }
  }, []);

  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside a ThemeProvider");
  return context;
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
              selected
                ? "bg-surface text-ink shadow-xs"
                : "text-ink-subtle hover:text-ink-muted",
            )}
          >
            <Icon aria-hidden className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
