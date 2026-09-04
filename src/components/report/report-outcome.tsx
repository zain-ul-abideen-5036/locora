"use client";

import { CheckCircle2, TriangleAlert } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";

/**
 * What a reporter sees the moment a report is filed.
 *
 * ## It says what happens next, not "success"
 *
 * Somebody who has just filed a report about a missing relative is going to
 * refresh the case page waiting for something to happen. If this screen only
 * said "Report submitted", the honest answer to "is anyone looking at this?"
 * would be nowhere on it. So it states plainly that the report is *not* public
 * yet, that a person has to review it, and that they will be told when that
 * changes.
 *
 * ## Photograph failures are reported, not swallowed
 *
 * Uploads happen after the report is created, and a failure there does not fail
 * the filing. But it must not be hidden either: a reporter who believes they
 * attached a photograph, and did not, has a materially worse case on the feed.
 * So the count is stated, and any refusal is shown with the reason and a route
 * to fix it.
 */
export function ReportOutcome({
  kind,
  reportId,
  photosAttempted,
  photosAdded,
  photoRejections,
}: {
  kind: "missing" | "found";
  reportId: string;
  photosAttempted: number;
  photosAdded: number;
  photoRejections: { index: number; reason: string }[];
}) {
  const photosFailed = photosAttempted - photosAdded;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex size-11 items-center justify-center rounded-xl bg-positive-soft text-positive">
          <CheckCircle2 aria-hidden className="size-5" />
        </div>
        <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-ink">
          Your report has been filed
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-muted">
          It is now with Locora&rsquo;s reviewers. It is <strong className="text-ink">not public
          yet</strong> — a person reads every report before it goes on the case feed, and you will
          be notified the moment that happens.
        </p>
      </div>

      {photosAttempted > 0 ? (
        photosFailed > 0 ? (
          <Callout tone="warning" title={`${photosAdded} of ${photosAttempted} photographs attached`}>
            <ul className="space-y-1">
              {photoRejections.map((rejection) => (
                <li key={`${rejection.index}-${rejection.reason}`} className="flex items-start gap-2">
                  <TriangleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />
                  {rejection.reason}
                </li>
              ))}
            </ul>
            <p className="mt-2">You can add more from the case page.</p>
          </Callout>
        ) : (
          <Callout tone="success" title={`${photosAdded} ${photosAdded === 1 ? "photograph" : "photographs"} attached`} />
        )
      ) : null}

      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-display text-base font-semibold text-ink">What happens now</h2>
        <ol className="mt-3 space-y-2.5">
          {[
            "A reviewer checks the details. This usually means confirming the report is genuine and complete.",
            "If it is published, it appears on the public case feed where anyone might recognise them.",
            "If something is missing or wrong, the report is declined with a note explaining why — and you can file again.",
            "If a reviewer finds a found-person report that might be the same person, you are told immediately.",
          ].map((step, index) => (
            <li key={step} className="flex gap-3 text-sm leading-relaxed text-ink-muted">
              <span
                aria-hidden
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-2xs font-semibold text-ink-muted"
              >
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <ButtonLink href={`/cases/${kind}/${reportId}`} size="lg" className="w-full sm:w-auto">
          View the case
        </ButtonLink>
        <ButtonLink href="/dashboard" size="lg" variant="secondary" className="w-full sm:w-auto">
          All my reports
        </ButtonLink>
      </div>
    </div>
  );
}
