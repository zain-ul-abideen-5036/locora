"use client";

/**
 * Reveals its children once, when they first scroll into view.
 *
 * ## Why not an animation library
 *
 * This is the only scroll-driven effect in the product, and it is twenty lines
 * of `IntersectionObserver`. Adding a motion library for it would put tens of
 * kilobytes of JavaScript on the critical path of a page that people reach in
 * an emergency, to fade in a heading.
 *
 * ## Why it starts visible
 *
 * The initial class is the *visible* one, and the hidden state is only applied
 * after the observer is attached. That ordering matters: with it the other way
 * round, anybody whose JavaScript fails to load — a flaky connection, a blocked
 * bundle, a browser extension — gets a permanently blank page instead of an
 * un-animated one. Content first, motion second.
 *
 * ## Reduced motion
 *
 * Checked before anything is set up, so a visitor who has asked for less motion
 * never has the hidden state applied at all. The global CSS rule in globals.css
 * would neutralise the transition anyway, but not the initial opacity — and an
 * element stuck at zero opacity is worse than one that never animated.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Reveal({
  children,
  delayMs = 0,
  className,
}: {
  children: ReactNode;
  /** Staggers siblings. Keep under ~300ms; beyond that it reads as lag. */
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle");

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setState("shown");
      return;
    }

    // Already on screen at mount — above the fold. Shown immediately rather
    // than animated, so the first thing a visitor sees is not mid-fade.
    const rect = element.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9) {
      setState("shown");
      return;
    }

    setState("hidden");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setState("shown");
            // Disconnected on first reveal: this is an entrance, not something
            // that should replay every time the element scrolls past.
            observer.disconnect();
          }
        }
      },
      // A negative bottom margin so the reveal begins slightly before the
      // element's edge clears the viewport, rather than after.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={state === "hidden" ? undefined : { transitionDelay: `${delayMs}ms` }}
      className={cn(
        "transition-[opacity,transform] duration-700 ease-out-quint motion-reduce:transition-none",
        state === "hidden" ? "translate-y-3 opacity-0" : "translate-y-0 opacity-100",
        className,
      )}
    >
      {children}
    </div>
  );
}
