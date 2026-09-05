import { CheckCircle2, CircleDashed, ClipboardList, Eye, Link2, XCircle } from "lucide-react";

import type { ReportStatus } from "@/db/enums";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

/**
 * Where a case has got to.
 *
 * ## Why a case page needs this at all
 *
 * A status badge says where a case is now. It does not say what has already
 * happened to it, and that is the thing a reporter refreshing this page
 * actually wants to know — whether anybody has looked at it yet. A single word
 * leaves them guessing; a sequence with the completed steps marked answers it.
 *
 * ## Only what is known is dated
 *
 * The filing date is always available. The review date is only on the owner and
 * reviewer projections, so for a stranger those steps appear without a date
 * rather than with an invented one. A timeline that guessed at timings would be
 * worse than one that admits what it does not have — and this is a case file,
 * where a wrong date is not a cosmetic error.
 *
 * ## Two shapes, not one
 *
 * A declined case gets a different final step rather than a greyed-out
 * "published" that never happened. Reusing the happy path and crossing it out
 * would tell somebody their report is somewhere on the way to publication when
 * it is not.
 */

interface TimelineStep {
  id: string;
  label: string;
  detail: string;
  date: string | null;
  state: "done" | "current" | "upcoming" | "stopped";
  Icon: typeof ClipboardList;
}

function buildSteps(
  status: ReportStatus,
  createdAt: string,
  reviewedAt: string | null,
  hasMatch: boolean,
): TimelineStep[] {
  const filed: TimelineStep = {
    id: "filed",
    label: "Report filed",
    detail: "Received and added to the review queue.",
    date: createdAt,
    state: "done",
    Icon: ClipboardList,
  };

  if (status === "rejected") {
    return [
      filed,
      {
        id: "declined",
        label: "Not published",
        detail: "A reviewer decided not to publish this report. The reason is on the case.",
        date: reviewedAt,
        state: "stopped",
        Icon: XCircle,
      },
    ];
  }

  if (status === "pending" || status === "under_review") {
    return [
      filed,
      {
        id: "review",
        label: status === "under_review" ? "Being checked" : "Waiting for a reviewer",
        detail:
          status === "under_review"
            ? "A reviewer is verifying the details on this report."
            : "A person reads every report before it is published. Nothing goes public automatically.",
        date: status === "under_review" ? reviewedAt : null,
        state: "current",
        Icon: status === "under_review" ? Eye : CircleDashed,
      },
      {
        id: "published",
        label: "Published",
        detail: "Visible on the public case feed.",
        date: null,
        state: "upcoming",
        Icon: CircleDashed,
      },
    ];
  }

  const published: TimelineStep = {
    id: "published",
    label: "Reviewed and published",
    detail: "Visible on the public case feed, where anyone might recognise them.",
    date: reviewedAt,
    state: "done",
    Icon: Eye,
  };

  const matched: TimelineStep = {
    id: "matched",
    label: "Linked to another report",
    detail: "A reviewer found a report that may describe the same person. Not yet confirmed.",
    date: null,
    state: status === "matched" ? "current" : "done",
    Icon: Link2,
  };

  const resolved: TimelineStep = {
    id: "resolved",
    label: "Case closed",
    detail: "Removed from the public feed, and the photographs deleted.",
    date: null,
    state: status === "resolved" ? "done" : "upcoming",
    Icon: status === "resolved" ? CheckCircle2 : CircleDashed,
  };

  // The link step only appears once there is actually a link, so a published
  // case with nothing to match against does not display a step implying one is
  // expected.
  return hasMatch || status === "matched" || status === "resolved"
    ? [filed, published, matched, resolved]
    : [filed, published];
}

export function CaseTimeline({
  status,
  createdAt,
  reviewedAt = null,
  hasMatch = false,
}: {
  status: ReportStatus;
  createdAt: string;
  reviewedAt?: string | null;
  hasMatch?: boolean;
}) {
  const steps = buildSteps(status, createdAt, reviewedAt, hasMatch);

  return (
    // An ordered list, because the steps have an order and a screen reader
    // should say "2 of 4" rather than reading four unrelated blocks.
    <ol className="relative space-y-0">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;

        return (
          <li key={step.id} className="relative flex gap-3.5 pb-5 last:pb-0">
            {/* The connector, drawn behind the markers. Dropped after the last
                step so the line does not trail into nothing. */}
            {!last ? (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[0.9375rem] top-8 h-[calc(100%-1.5rem)] w-px",
                  step.state === "done" ? "bg-primary/30" : "bg-line",
                )}
              />
            ) : null}

            <span
              aria-hidden
              className={cn(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border",
                step.state === "done" && "border-transparent bg-primary-soft text-primary",
                step.state === "current" && "border-caution/40 bg-caution-soft text-caution-fg",
                step.state === "upcoming" && "border-line bg-surface text-ink-subtle",
                step.state === "stopped" && "border-transparent bg-critical-soft text-critical-fg",
              )}
            >
              <step.Icon className="size-3.5" />
            </span>

            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p
                  className={cn(
                    "text-sm font-semibold",
                    step.state === "upcoming" ? "text-ink-subtle" : "text-ink",
                  )}
                >
                  {step.label}
                </p>
                {step.date ? (
                  <time className="text-xs text-ink-subtle" dateTime={step.date}>
                    {formatDate(step.date)}
                  </time>
                ) : null}
                {/* Announced only to assistive technology: sighted users read the
                    state from the marker's colour and the connector. */}
                {step.state === "current" ? <span className="sr-only">— current step</span> : null}
              </div>
              <p
                className={cn(
                  "mt-0.5 text-sm leading-relaxed",
                  step.state === "upcoming" ? "text-ink-subtle" : "text-ink-muted",
                )}
              >
                {step.detail}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
