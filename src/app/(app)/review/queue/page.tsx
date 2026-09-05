import { CheckCircle2, ImageOff, SearchX } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { QueueControls, type QueueControlValues } from "@/components/review/queue-controls";
import { ReviewDecision } from "@/components/review/review-decision";
import { KindBadge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";
import type { ReportStatus } from "@/db/enums";
import {
  formatAgeRange,
  formatCount,
  formatDate,
  formatGender,
  formatRelative,
} from "@/lib/format";
import { requireAdmin } from "@/server/auth/current-user";
import { listReviewQueue } from "@/server/reports/queries";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/**
 * The review queue.
 *
 * ## Longest waiting first, and it says how long
 *
 * That default is the whole point of a queue on this platform: the case that
 * has been waiting longest is the one where the delay is doing the most harm.
 * The wait is printed on every row so it is a fact a reviewer can act on rather
 * than an implication of the sort order — and choosing newest-first shows a
 * warning saying the longest-waiting case is no longer at the top.
 *
 * ## Everything needed to decide is on the row
 *
 * Photograph, description, location, the reporter's contact details and the
 * date. A reviewer working a queue should not have to open each case in its own
 * tab to establish whether it is genuine; that is the difference between
 * clearing a queue and abandoning one.
 */
export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const reviewer = await requireAdmin();
  const params = await searchParams;

  const kind = params.kind === "found" ? "found" : "missing";
  const status = parseStatus(params.status);
  const order = params.order === "newest" ? "newest" : "oldest";
  const search = params.q?.trim() || undefined;
  const offset = Math.max(Number(params.offset ?? 0) || 0, 0);

  const page = await listReviewQueue(
    kind,
    STATUS_FILTERS[status],
    { offset, limit: PAGE_SIZE },
    reviewer,
    { search, order },
  );

  const controlValues: QueueControlValues = { kind, search, status, order };
  const filtered = Boolean(search) || status !== "waiting";

  return (
    <div>
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Review queue
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Nothing here is visible to the public yet.
          {page.total > 0 ? (
            <>
              {" "}
              <span className="font-medium text-ink">
                {formatCount(page.total)} waiting
              </span>{" "}
              in {kind === "missing" ? "missing-person" : "found-person"} reports.
            </>
          ) : null}
        </p>
      </div>

      <KindTabs kind={kind} params={params} />

      <div className="mt-4">
        <QueueControls values={controlValues} resultCount={page.items.length} />
      </div>

      <div className="mt-5">
        {page.items.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={<SearchX aria-hidden className="size-5" />}
              title="Nothing matches"
              description="No report in this queue matches those filters. Try a shorter search, or reset to everything waiting."
              action={
                <ButtonLink href={`/review/queue?kind=${kind}`} variant="secondary">
                  Reset filters
                </ButtonLink>
              }
            />
          ) : (
            <EmptyState
              icon={<CheckCircle2 aria-hidden className="size-5" />}
              title="Queue is clear"
              description={
                kind === "missing"
                  ? "No missing-person reports are waiting for a decision."
                  : "No found-person reports are waiting for a decision."
              }
              action={
                <ButtonLink
                  href={`/review/queue?kind=${kind === "missing" ? "found" : "missing"}`}
                  variant="secondary"
                >
                  Check the {kind === "missing" ? "found-person" : "missing-person"} queue
                </ButtonLink>
              }
            />
          )
        ) : (
          <>
            <ul className="space-y-4">
              {page.items.map((report) => (
                <li key={report.id}>
                  <QueueRow report={report} />
                </li>
              ))}
            </ul>
            <QueuePagination page={page} params={params} />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The three views of the queue.
 *
 * "Everything waiting" is the default and covers both states. The other two
 * exist because they answer different questions: "not yet opened" is untouched
 * work, and "being checked" is what a reviewer left half-finished — which is
 * otherwise easy to lose track of, because a report marked under review looks
 * handled from the outside and is not.
 */
const STATUS_FILTERS: Record<QueueControlValues["status"], ReportStatus[]> = {
  waiting: ["pending", "under_review"],
  pending: ["pending"],
  under_review: ["under_review"],
};

function parseStatus(raw: string | undefined): QueueControlValues["status"] {
  if (raw === "pending" || raw === "under_review") return raw;
  return "waiting";
}

function KindTabs({
  kind,
  params,
}: {
  kind: "missing" | "found";
  params: Record<string, string | undefined>;
}) {
  // Filters carry across the tab switch, minus the kind and the page, so a
  // reviewer narrowed to a city stays narrowed when they check the other queue.
  const carried = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "kind" || key === "offset") continue;
    if (value) carried.set(key, value);
  }

  const tabs = [
    { value: "missing" as const, label: "Missing people" },
    { value: "found" as const, label: "People found" },
  ];

  return (
    <nav aria-label="Report type" className="mt-5 flex gap-1 border-b border-line">
      {tabs.map((tab) => {
        const query = new URLSearchParams(carried);
        query.set("kind", tab.value);
        const active = kind === tab.value;

        return (
          <Link
            key={tab.value}
            href={`/review/queue?${query.toString()}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-primary text-ink"
                : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
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
  const reviewNotes = "reviewNotes" in report ? report.reviewNotes : null;

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative size-24 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-sunken">
            {photo ? (
              <Image
                src={photo.url}
                alt="Photograph submitted with this report"
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
              {/* Stated, not implied by position in the list. */}
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

            {/* Shown when a report has been round the loop before, so a reviewer
                is not deciding without the context of the last decision. */}
            {reviewNotes ? (
              <p className="mt-1 rounded-md border border-line bg-surface-sunken px-2.5 py-1.5 text-xs text-ink-muted">
                <span className="font-medium text-ink">Previous note:</span> {reviewNotes}
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

function QueuePagination({
  page,
  params,
}: {
  page: { total: number; offset: number; limit: number };
  params: Record<string, string | undefined>;
}) {
  const totalPages = Math.ceil(page.total / page.limit);
  if (totalPages <= 1) return null;

  const currentPage = Math.floor(page.offset / page.limit) + 1;

  const linkFor = (pageNumber: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "offset" || !value) continue;
      query.set(key, value);
    }
    const nextOffset = (pageNumber - 1) * page.limit;
    if (nextOffset > 0) query.set("offset", String(nextOffset));
    return `/review/queue?${query.toString()}`;
  };

  return (
    <nav
      aria-label="Queue pagination"
      className="mt-6 flex items-center justify-between gap-4 border-t border-line pt-5"
    >
      {currentPage > 1 ? (
        <ButtonLink href={linkFor(currentPage - 1)} variant="secondary" size="sm">
          Previous
        </ButtonLink>
      ) : (
        // A spacer rather than an omitted element, so "Next" does not jump
        // across the row when the first page is reached.
        <span aria-hidden className="w-20" />
      )}

      <p className="text-sm text-ink-muted" data-numeric>
        Page {currentPage} of {totalPages}
      </p>

      {currentPage < totalPages ? (
        <ButtonLink href={linkFor(currentPage + 1)} variant="secondary" size="sm">
          Next
        </ButtonLink>
      ) : (
        <span aria-hidden className="w-20" />
      )}
    </nav>
  );
}
