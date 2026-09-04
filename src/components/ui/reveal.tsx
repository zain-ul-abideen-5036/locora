"use client";

/**
 * Reveals its children once, when they first scroll into view.
 *
 * ## Why not an animation library
 *
 * This is the only scroll-driven effect in the product, and it is twenty lines
 * of `IntersectionObserver`. Adding a motion library for it would put tens of
 * kilobytes of JavaScript on the critical path of a page people reach in an
 * emergency, in order to fade in a heading.
 *
 * ## Why there is no React state here
 *
 * The effect drives the DOM directly, adding and removing a class. That is not
 * a shortcut around React — it is what an effect is for. The visibility of this
 * element is state owned by an external system (the scroll position, via an
 * observer), nothing else in the tree needs to read it, and a re-render per
 * reveal buys nothing. It also avoids the cascading render that calling
 * `setState` synchronously in an effect body causes.
 *
 * ## Why it starts visible
 *
 * The markup renders in the *visible* state and the hidden class is applied by
 * the effect, only once the observer is attached. That ordering is
 * load-bearing: reversed, anybody whose JavaScript fails to arrive — a flaky
 * connection, a blocked bundle, an extension — would get a permanently blank
 * page rather than an un-animated one. Content first, motion second.
 */

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/cn";

const HIDDEN_CLASSES = ["translate-y-3", "opacity-0"] as const;

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

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Checked before anything is hidden, so somebody who has asked their
    // operating system for less motion never has the hidden state applied at
    // all. The global rule in globals.css would neutralise the transition, but
    // not an element left at zero opacity.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Already on screen at mount — above the fold. Left alone rather than
    // animated, so the first thing a visitor sees is not mid-fade.
    if (element.getBoundingClientRect().top < window.innerHeight * 0.9) return;

    element.classList.add(...HIDDEN_CLASSES);
    element.style.transitionDelay = `${delayMs}ms`;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          element.classList.remove(...HIDDEN_CLASSES);
          // Disconnected on first reveal: this is an entrance, not something to
          // replay every time the element scrolls past.
          observer.disconnect();
        }
      },
      // A negative bottom margin so the reveal begins slightly before the
      // element's edge clears the viewport, rather than after.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
      // Cleared on unmount so a re-mounted element is not left hidden with no
      // observer to reveal it.
      element.classList.remove(...HIDDEN_CLASSES);
      element.style.transitionDelay = "";
    };
  }, [delayMs]);

  return (
    <div
      ref={ref}
      className={cn(
        "translate-y-0 opacity-100",
        "transition-[opacity,transform] duration-700 ease-out-quint motion-reduce:transition-none",
        className,
      )}
    >
      {children}
    </div>
  );
}
