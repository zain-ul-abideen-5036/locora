import { ScrollText } from "lucide-react";
import type { Metadata } from "next";

import { ReviewNav } from "@/components/review/review-nav";
import { requireAdmin } from "@/server/auth/current-user";
import { toPageError } from "@/server/http/page-errors";
import { reviewQueueCounts } from "@/server/reports/queries";

export const metadata: Metadata = {
  title: "Review console",
  robots: { index: false, follow: false },
};

/**
 * The reviewer console shell.
 *
 * ## It is a console, not a dashboard
 *
 * There are no summary tiles, no charts and no counters of things nobody acts
 * on. A reviewer opens this to answer one question — what needs my attention —
 * so the navigation carries live queue counts and every count is a link to the
 * work it represents. A metric that is not a link to an action is a metric that
 * is only there to look busy.
 *
 * ## The guard
 *
 * `requireAdmin` here, and again in every page and route beneath. Not
 * redundant: in the App Router a layout renders in parallel with its pages
 * rather than gating them, so a page relying on this check would be relying on
 * an ordering guarantee that does not exist.
 */
export default async function ReviewLayout({ children }: { children: React.ReactNode }) {
  // requireAdmin throws an AppError, which from a Server Component would reach
  // the error boundary as a 500. Translated so a standard account gets a real
  // 403 and a page explaining how access is granted.
  try {
    await requireAdmin();
  } catch (error) {
    toPageError(error, { returnTo: "/review" });
  }

  const counts = await reviewQueueCounts();

  const items = [
    {
      href: "/review/queue",
      label: "Review queue",
      icon: "queue" as const,
      count: counts.pendingMissing + counts.pendingFound,
    },
    {
      href: "/review/matches",
      label: "Matches",
      icon: "matches" as const,
      count: counts.possibleMatches,
    },
    {
      href: "/review/flags",
      label: "Flagged cases",
      icon: "flags" as const,
      count: counts.openAbuseReports,
    },
    { href: "/review/users", label: "Accounts", icon: "users" as const, count: 0 },
    { href: "/review/audit", label: "Audit trail", icon: "audit" as const, count: 0 },
  ];

  return (
    <div className="container-page py-6 sm:py-8">
      {/*
        A compact identity bar rather than a page header.

        This shell renders above every screen in the console, on every visit. An
        eyebrow, a display-sized title and a three-line paragraph cost around
        150 pixels on a desktop and rather more on a phone, where the paragraph
        wrapped to three lines and pushed the first queue row entirely below the
        fold. A reviewer opening this twenty times a day does not need to be
        told twenty times, at that size, what the product is called.

        Nothing is dropped — the console still names itself, still marks itself
        as reviewer-only, and still states that actions are attributed, which is
        the one fact a reviewer genuinely needs in view. It is simply sized as
        the persistent chrome it is. The page's own heading beneath is the
        larger of the two deliberately: the work is the content here, and the
        console is the frame around it.
      */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line pb-4">
        <div className="flex items-center gap-2.5">
          <h1 className="font-display text-xl font-semibold tracking-tight text-ink">
            Review console
          </h1>
          <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
            Reviewer only
          </span>
        </div>
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-ink-muted">
          <ScrollText aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Every action is recorded against your account, and some are visible to the reporter
            immediately.
          </span>
        </p>
      </header>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
        <ReviewNav items={items} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
