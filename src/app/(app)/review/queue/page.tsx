import { CheckCircle2, ImageOff } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { ReviewDecision } from "@/components/review/review-decision";
import { KindBadge, StatusBadge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";
import { formatAgeRange, formatDate, formatGender, formatRelative } from "@/lib/format";
import { requireAdmin } from "@/server/auth/current-user";
import { listReviewQueue } from "@/server/reports/queries";

export const dynamic = "force-dynamic";

/**
 * The review queue.
 *
 * ## Oldest first, and it says how long they have waited
 *
 * That ordering is the whole point of a queue on this platform: the case that
 * has been waiting longest is the one where the delay is doing the most harm.
 * The wait time is shown on every row so it is a fact rather than an
 * implication of the sort order.
 *
 * ## Everything needed to decide is on the row
 *
 * The photograph, the description, the location, the contact details and the
 * date. A reviewer working through a queue should not have to open each case in
 * a new tab to find out whether it is genuine — that is the difference between
 * clearing a queue and abandoning one.
 */
export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const reviewer = await requireAdmin();
  const { kind: rawKind } = await searchParams;
  const kind = rawKind === "found" ? "found" : "missing";

  const page = await listReviewQueue(
    kind,
    ["pending", "under_review"],
    { offset: 0, limit: 30 },
    reviewer,
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Review queue
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Oldest first. Nothing here is visible to the public yet.
          </p>
        </div>
      </div>

      <nav aria-label="Report type" className="mt-5 flex gap-1 border-b border-line">
        {(
          [
            { value: "missing", label: "Missing people" },
            { value: "found", label: "People found" },
          ] as const
        ).map((tab) => (
          <Link
            key={tab.value}
            href={`/review/queue?kind=${tab.value}`}
            aria-current={kind === tab.value ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              kind === tab.value
                ? "border-primary text-ink"
                : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {page.items.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 aria-hidden className="size-5" />}
            title="Queue is clear"
            description={
              kind === "missing"
                ? "No missing-person reports are waiting for a decision."
                : "No found-person reports are waiting for a decision."
            }
          />
        ) : (
          <ul className="space-y-4">
            {page.items.map((report) => (
              <li key={report.id}>
                <QueueRow report={report} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type QueuedReport = Awaited<ReturnType<typeof listReviewQueue>>["items"][number];

function QueueRow({ report }: { report: QueuedReport }) {
  const isMissing = report.kind === "missing";
  const personLabel = isMissing ? report.fullName : "This unidentified person";
  const photo = report.photos[0];

  // Present because the queue is fetched as a reviewer, so the projection
  // includes them. Narrowed rather than asserted, so a change to the projection
  // becomes a type error here instead of `undefined` on screen.
  const contactName = "contactName" in report ? report.contactName : null;
  const contactPhone = "contactPhone" in report ? report.contactPhone : null;

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative size-24 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-sunken">
            {photo ? (
              <Image
                src={photo.url}
                alt={`Photograph submitted with this report`}
                fill
                sizes="96px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1 text-ink-subtle">
                <ImageOff aria-hidden className="size-4" />
                <span className="text-2xs">No photo</span>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <KindBadge kind={report.kind} />
              <StatusBadge status={report.status} />
              {/* The wait is stated, not implied by position in the list. */}
              <span className="text-xs font-medium text-caution-fg">
                waiting {formatRelative(report.createdAt)}
              </span>
            </div>

            <h3 className="font-display text-lg font-semibold text-ink">
              {isMissing ? report.fullName : "Unidentified person"}
            </h3>

            <p className="text-sm text-ink-muted">
              {isMissing
                ? `${report.age} years old · ${formatGender(report.gender)} · last seen ${report.lastSeenCity}, ${formatDate(report.lastSeenAt)}`
                : `${formatAgeRange(report.estimatedAgeMin, report.estimatedAgeMax)} · ${formatGender(report.gender)} · found ${report.foundCity}, ${formatDate(report.foundAt)}`}
            </p>

            <p className="text-sm leading-relaxed text-ink-muted">
              {(isMissing ? report.clothingDescription : report.notes) ??
                report.distinguishingFeatures ??
                "No description given."}
            </p>

            {contactName && contactPhone ? (
              <p className="text-xs text-ink-subtle">
                Reporter: {contactName} · {contactPhone}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <Link
            href={`/cases/${report.kind}/${report.id}`}
            className="text-sm text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
          >
            Open the full case
          </Link>

          <ReviewDecision
            kind={report.kind}
            reportId={report.id}
            personLabel={personLabel}
            currentStatus={report.status}
          />
        </div>
      </CardBody>
    </Card>
  );
}
