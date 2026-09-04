"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { Button, ButtonLink } from "@/components/ui/button";

/**
 * The route-level error boundary.
 *
 * ## What it does and does not show
 *
 * `error.message` is not rendered. In a production build Next replaces it with
 * a generic string anyway, but the important reason is that this component also
 * catches errors thrown during a server render — where the message could carry
 * a database error, a table name, or a fragment of somebody's case. `digest` is
 * shown instead: a hash Next generates that correlates with the full error in
 * the server log, which is exactly enough for a support conversation and
 * nothing more.
 *
 * ## Why the retry is offered first
 *
 * A large share of what lands here is transient — a cold database connection, a
 * dropped network. `reset()` re-renders the segment without a full page load,
 * so the usual outcome of one click is that the page simply works.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logged from the browser so a client-side failure is not invisible. The
    // digest is the only identifying part carried; the message deliberately is
    // not, for the reason above.
    console.error("[locora] route error", { digest: error.digest });
  }, [error.digest]);

  return (
    <div className="container-page flex min-h-[60dvh] items-center py-20">
      <div className="mx-auto max-w-lg text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-critical-soft text-critical">
          <TriangleAlert aria-hidden className="size-5" />
        </div>

        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-ink">
          Something went wrong
        </h1>

        <p className="mt-3 text-base leading-relaxed text-ink-muted">
          This is on our side, not yours. Trying again usually works — most failures here are a
          moment of bad luck rather than something broken.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
          <Button onClick={reset}>
            <RotateCcw aria-hidden className="size-4" />
            Try again
          </Button>
          <ButtonLink href="/" variant="secondary">
            Go to the home page
          </ButtonLink>
        </div>

        {error.digest ? (
          <p className="mt-8 text-xs text-ink-subtle">
            If it keeps happening, quote this reference:{" "}
            <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono">
              {error.digest}
            </code>
          </p>
        ) : null}
      </div>
    </div>
  );
}
