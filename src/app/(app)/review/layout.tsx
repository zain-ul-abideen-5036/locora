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
    <div className="container-page py-8 sm:py-10">
      <header className="border-b border-line pb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
          Reviewer only
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink">
          Review console
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Every action here is recorded in the audit trail against your account, and several are
          visible to a reporter the moment you take them.
        </p>
      </header>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
        <ReviewNav items={items} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
