"use client";

/**
 * Whether the viewer has asked their system for reduced motion.
 *
 * `useSyncExternalStore` rather than an effect that calls `setState`, for the
 * same reason as the theme preference: this is state that lives outside React,
 * can change without React's involvement, and has a different value on the
 * server than in the browser. Reading it in a `useState` initialiser produces a
 * hydration mismatch; reading it in an effect and setting state causes a
 * cascading render on every mount of every component that asks.
 *
 * ## This is not a preference, for some people
 *
 * For somebody with a vestibular disorder, animation is not a matter of taste —
 * it causes nausea. So the answer here is honoured properly rather than
 * approximated: components that read it are expected to render a genuinely
 * different, still-useful thing, not the same thing with the transitions turned
 * off. The walkthrough, for instance, becomes a readable storyboard.
 *
 * The global rule in globals.css collapses every CSS animation and transition
 * regardless. This hook exists for the cases CSS cannot express — deciding not
 * to run a timeline at all, or to render different markup.
 */

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onStoreChange: () => void): () => void {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

/**
 * On the server there is no way to know, and `false` is the safer guess: it
 * renders the animated form, which the client corrects on hydration if the
 * viewer asked otherwise. Guessing `true` would show the static alternative to
 * everybody for a frame, which is a worse default for the majority.
 */
function getServerSnapshot(): boolean {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
