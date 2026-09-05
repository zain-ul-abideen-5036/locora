import { ShieldX } from "lucide-react";
import type { Metadata } from "next";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "No access",
  robots: { index: false, follow: false },
};

/**
 * The 403.
 *
 * Rendered by `forbidden()` with a real 403 status. It says plainly that the
 * area is restricted and that access is granted by a reviewer, rather than
 * implying the visitor did something wrong — the usual way to arrive here is
 * following a colleague's link to the review console without having been given
 * access yet.
 */
export default function Forbidden() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main id="main" className="container-page flex flex-1 items-center py-20">
        <div className="mx-auto max-w-lg text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-caution-soft text-caution">
            <ShieldX aria-hidden className="size-5" />
          </div>

          <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-ink">
            You do not have access to this
          </h1>

          <p className="mt-3 text-base leading-relaxed text-ink-muted">
            This part of Locora is restricted to reviewers. If you need access, an existing
            reviewer can grant it from the console — it is not something you can request here.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
            <ButtonLink href="/dashboard">Go to my reports</ButtonLink>
            <ButtonLink href="/cases" variant="secondary">
              Browse cases
            </ButtonLink>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
