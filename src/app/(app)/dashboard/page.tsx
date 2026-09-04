import { FilePlus2, Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ResendConfirmationButton } from "@/components/account/resend-confirmation-button";
import { CaseCard } from "@/components/cases/case-card";
import { ButtonLink } from "@/components/ui/button";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { requireUser } from "@/server/auth/current-user";
import { listMyReports } from "@/server/reports/queries";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { explainStatus, formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "My reports",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The reporter's own view of their cases.
 *
 * ## Status is explained, not just labelled
 *
 * Each report shows its status *and* a sentence saying what that means. This is
 * the page somebody refreshes while waiting for news about a relative, and
 * "pending" on its own does not answer the question they actually have — which
 * is whether a human being has looked at it yet.
 *
 * ## Reports in the queue are listed differently from published ones
 *
 * A case awaiting review is shown as a row with its status and any reviewer
 * note, because what matters about it is its progress. A published case is
 * shown as the card a stranger would see, because what matters then is how it
 * looks on the feed — and whether the photograph they chose actually reads.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const { missing, found } = await listMyReports(user.id, user);

  const all = [...missing, ...found].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const inProgress = all.filter(
    (report) => report.status === "pending" || report.status === "under_review",
  );
  const live = all.filter((report) => report.status === "published" || report.status === "matched");
  const closed = all.filter(
    (report) => report.status === "resolved" || report.status === "rejected",
  );

  return (
    <div className="container-page py-10 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <header>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            My reports
          </h1>
          <p className="mt-2 text-base text-ink-muted">
            {all.length === 0
              ? "You have not filed a report yet."
              : `${all.length} ${all.length === 1 ? "report" : "reports"} filed.`}
          </p>
        </header>

        <ButtonLink href="/report">
          <FilePlus2 aria-hidden className="size-4" />
          File a report
        </ButtonLink>
      </div>

      {!user.isEmailVerified ? (
        <div className="mt-6">
          <Callout tone="warning" title="Confirm your email address">
            <p>
              We sent a link to <span className="font-medium text-ink">{user.email}</span>.
              Confirming it is what lets you file a report — it is how Locora keeps the review queue
              from being flooded with fabricated cases.
            </p>
            <div className="mt-3">
              <ResendConfirmationButton />
            </div>
          </Callout>
        </div>
      ) : null}

      {all.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<Inbox aria-hidden className="size-5" />}
            title="Nothing filed yet"
            description="When you file a report it appears here, along with its progress through review and any notes from a reviewer."
            action={
              <ButtonLink href="/report" variant="secondary">
                File your first report
              </ButtonLink>
            }
          />
        </div>
      ) : (
        <div className="mt-10 space-y-12">
          {inProgress.length > 0 ? (
            <Section
              title="With a reviewer"
              description="Not public yet. A person is checking the details."
            >
              <ul className="space-y-3">
                {inProgress.map((report) => (
                  <li key={report.id}>
                    <ProgressRow report={report} />
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {live.length > 0 ? (
            <Section
              title="Published"
              description="Visible on the public case feed. This is what a stranger sees."
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {live.map((report) => (
                  <CaseCard key={report.id} report={report} />
                ))}
              </div>
            </Section>
          ) : null}

          {closed.length > 0 ? (
            <Section title="Closed" description="Resolved cases, and reports that were not published.">
              <ul className="space-y-3">
                {closed.map((report) => (
                  <li key={report.id}>
                    <ProgressRow report={report} />
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">{title}</h2>
        <p className="mt-1 text-sm text-ink-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

type OwnReport = Awaited<ReturnType<typeof listMyReports>>["missing"][number] |
  Awaited<ReturnType<typeof listMyReports>>["found"][number];

function ProgressRow({ report }: { report: OwnReport }) {
  const isMissing = report.kind === "missing";
  const title = isMissing ? report.fullName : "Unidentified person";
  const city = isMissing ? report.lastSeenCity : report.foundCity;
  // Present only on the owner projection, which this page always gets — but
  // narrowed rather than asserted, so a future change to the projection is a
  // type error here instead of a runtime one.
  const reviewNotes = "reviewNotes" in report ? report.reviewNotes : null;

  return (
    <Card interactive className="p-0">
      <Link href={`/cases/${report.kind}/${report.id}`} className="block">
        <CardBody className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
              <p className="mt-0.5 text-sm text-ink-muted">
                {isMissing ? "Missing" : "Found"} · {city} · filed {formatDate(report.createdAt)}
              </p>
            </div>
            <StatusBadge status={report.status} />
          </div>

          <p className="text-sm text-ink-muted">{explainStatus(report.status)}</p>

          {reviewNotes ? (
            <p className="rounded-md border border-line bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
              <span className="font-medium text-ink">Reviewer&rsquo;s note:</span> {reviewNotes}
            </p>
          ) : null}
        </CardBody>
      </Link>
    </Card>
  );
}
