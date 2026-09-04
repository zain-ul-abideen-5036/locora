import { SearchX } from "lucide-react";
import type { Metadata } from "next";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

/**
 * The 404.
 *
 * Worth writing carefully rather than shipping "Page not found", because on
 * this product one of the likely ways to arrive here is following a link to a
 * case that has since been resolved and taken down. Somebody in that position
 * needs to know the page is gone deliberately and that the case may have ended
 * well — not to be told they made a mistake.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main id="main" className="container-page flex flex-1 items-center py-20">
        <div className="mx-auto max-w-lg text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-surface-sunken text-ink-subtle">
            <SearchX aria-hidden className="size-5" />
          </div>

          <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-ink">
            This page is not here
          </h1>

          <p className="mt-3 text-base leading-relaxed text-ink-muted">
            The link may be mistyped, or it may point to a case that has since been closed.
            Resolved cases are removed from Locora once the person has been found — so a missing
            case page is sometimes good news.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
            <ButtonLink href="/cases">Browse open cases</ButtonLink>
            <ButtonLink href="/" variant="secondary">
              Go to the home page
            </ButtonLink>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
