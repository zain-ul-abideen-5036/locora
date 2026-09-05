import { afterEach, beforeAll, vi } from "vitest";

/**
 * Setup shared by every unit test.
 *
 * These tests never touch a database or the network.
 *
 * The DOM section is guarded, because individual files opt out of jsdom with
 * `@vitest-environment node` — the token tests have to, since jsdom installs
 * its own realm's `Uint8Array` and `jose` then rejects a perfectly good key.
 * One setup file serves both, rather than two that drift apart.
 */

beforeAll(async () => {
  // A stable, explicit signing key, so token tests do not depend on whether a
  // developer happens to have AUTH_SECRET set in their shell.
  process.env.AUTH_SECRET = "unit-test-signing-key-not-used-anywhere-else-0123456789";

  if (typeof window === "undefined") return;

  await import("@testing-library/jest-dom/vitest");

  /**
   * jsdom implements neither of these, and both are read during a first render
   * by components that respect reduced motion or observe scroll position.
   * Without the stubs those components throw before their assertions run.
   */
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  }

  if (!("IntersectionObserver" in window)) {
    class StubIntersectionObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "";
      readonly thresholds: ReadonlyArray<number> = [];
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      takeRecords = vi.fn(() => []);
    }
    Object.defineProperty(window, "IntersectionObserver", {
      writable: true,
      value: StubIntersectionObserver,
    });
  }

  // jsdom does not implement the dialog element's modal behaviour, and the
  // components under test call these directly.
  if (typeof HTMLDialogElement !== "undefined") {
    HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
      this.open = false;
    };
  }
});

/**
 * Unmounts anything a test rendered.
 *
 * Without this, a component that registered a document-level listener stays
 * subscribed and reacts to the next test's DOM — which produces failures in
 * whichever test happens to run next rather than in the one at fault.
 */
afterEach(async () => {
  if (typeof window === "undefined") return;
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});
