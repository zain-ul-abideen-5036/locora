import { AlertTriangle, ArrowLeft, Link2, Lock, Phone, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { toPageError } from "@/server/http/page-errors";

import { CaseTimeline } from "@/components/cases/case-timeline";
import { LocationMap } from "@/components/cases/location-map";
import { PhotoGallery } from "@/components/cases/photo-gallery";
import { ReportConcernButton } from "@/components/cases/report-concern-button";
import { KindBadge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Detail, DetailList } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { uuidSchema } from "@/lib/validation/common";
import {
  explainStatus,
  formatAgeRange,
  formatDate,
  formatDateTime,
  formatDuration,
  formatGender,
  formatHeight,
} from "@/lib/format";
import { getCurrentUser } from "@/server/auth/current-user";
import { listMatchesForReport } from "@/server/matches/service";
import { getFoundReport, getMissingReport } from "@/server/reports/service";
import {
  type FoundReportView,
  hasOwnerDetails,
  type MissingReportView,
} from "@/server/reports/visibility";

/**
 * One case.
 *
 * ## Authorisation is the service layer's job
 *
 * `getMissingReport` / `getFoundReport` throw a 404 if this viewer may not see
 * this case — including for a pending or rejected report whose id somebody has
 * come by. There is no check in this file, and there should not be: a page that
 * re-implements the rule is a page that can disagree with it.
 *
 * ## Why the two kinds share one route
 *
 * `/cases/[kind]/[id]` rather than two routes, because everything around the
 * case — the layout, the gallery, the concern button, the metadata — is
 * identical, and only the field list differs. Two routes would mean two copies
 * of that shell, drifting apart.
 */

/**
 * Deliberately *not* `force-dynamic`.
 *
 * The page is already rendered per request — `getCurrentUser` reads cookies,
 * which opts the route out of static rendering — so the directive would be
 * redundant. It is also actively harmful here: with it, Next begins streaming
 * the response before this component runs, so the 200 is already on the wire by
 * the time `notFound()` is reached and a missing case answers 200 with the
 * not-found page rendered inside it. A crawler indexes that, and a monitor
 * reports the site as healthy while serving nothing.
 *
 * Freshness is unaffected: a case that has just been resolved still disappears
 * on the next request.
 */
type Params = Promise<{ kind: string; id: string }>;

/**
 * Metadata, and a deliberate difference between the two kinds.
 *
 * A published missing-person case is indexed. That is the whole point: the best
 * chance a family has is somebody searching a name and finding the case, and
 * withholding it from search would remove the largest source of recognition
 * this product has.
 *
 * A found-person case is not indexed. There is no name to search for, so
 * indexing offers almost nothing — while the subject is an unidentified and
 * often vulnerable person who has consented to nothing, and a search engine's
 * cache outlives the case being taken down. The asymmetry is the point.
 */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { kind, id } = await params;
  if (!uuidSchema.safeParse(id).success) return { title: "Case not found" };

  const viewer = await getCurrentUser();

  try {
    if (kind === "missing") {
      const report = await getMissingReport(id, viewer);
      const indexable = report.status === "published" || report.status === "matched";
      return {
        title: `${report.fullName}, ${report.age} — missing from ${report.lastSeenCity}`,
        description: `${report.fullName}, aged ${report.age}, was last seen in ${report.lastSeenCity} on ${formatDate(report.lastSeenAt)}. If you have seen them, tell Locora.`,
        robots: { index: indexable, follow: indexable },
        openGraph: {
          title: `${report.fullName} is missing from ${report.lastSeenCity}`,
          description: `Last seen ${formatDate(report.lastSeenAt)}. Aged ${report.age}.`,
          images: report.photos[0] ? [{ url: report.photos[0].url }] : undefined,
        },
      };
    }

    if (kind === "found") {
      const report = await getFoundReport(id, viewer);
      return {
        title: `Unidentified person found in ${report.foundCity}`,
        description: `An unidentified person was found in ${report.foundCity} on ${formatDate(report.foundAt)}.`,
        robots: { index: false, follow: false },
      };
    }
  } catch {
    // A case this viewer cannot see. Returning a neutral title rather than
    // letting the error through keeps the metadata pass from revealing, by its
    // failure, that an id is real.
  }

  return { title: "Case not found", robots: { index: false, follow: false } };
}

export default async function CasePage({ params }: { params: Params }) {
  const { kind, id } = await params;

  if (kind !== "missing" && kind !== "found") notFound();
  // Checked before the query: a malformed id would otherwise reach Postgres as
  // an invalid uuid literal and come back as a 500 rather than a 404.
  if (!uuidSchema.safeParse(id).success) notFound();

  const viewer = await getCurrentUser();

  /**
   * The service throws an AppError when this viewer may not see the case —
   * including for one that is merely unreviewed. Thrown from a Server Component
   * that would reach the error boundary and render a 500, so it is translated
   * into Next's own 404 here. Reporting a server fault for a case somebody is
   * not permitted to see is wrong for the visitor, wrong for a crawler, and
   * misleading to anybody diagnosing it.
   */
  let loaded: MissingReportView | FoundReportView;
  try {
    loaded =
      kind === "missing" ? await getMissingReport(id, viewer) : await getFoundReport(id, viewer);
  } catch (error) {
    // Returns `never`, so TypeScript knows `loaded` is assigned past this point.
    toPageError(error, { returnTo: `/cases/${kind}/${id}` });
  }

  // Rebound as a const so narrowing through `isMissing` works below. TypeScript
  // will not narrow a `let` through an aliased condition, because the binding
  // could be reassigned between the check and the use.
  const report = loaded;

  const isMissing = report.kind === "missing";
  const personLabel = isMissing ? report.fullName : "an unidentified person";
  const ownerView = isMissing
    ? hasOwnerDetails(report)
      ? report
      : null
    : hasOwnerDetails(report)
      ? report
      : null;

  // Only fetched for people entitled to see it. A stranger browsing a published
  // case has no business knowing it has been linked to another report — that is
  // information about a second family's case.
  const matches =
    report.viewerIsOwner || report.viewerIsReviewer ? await listMatchesForReport(kind, id) : [];

  return (
    <div className="container-page py-8 sm:py-12">
      <Link
        href={`/cases?kind=${kind}`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        Back to cases
      </Link>

      {/* Shown before anything else when a case is not public, so a reviewer or
          owner is never unsure whether what they are looking at is live. */}
      {report.status !== "published" && report.status !== "matched" ? (
        <div className="mt-5">
          <Callout
            tone={report.status === "rejected" ? "danger" : report.status === "resolved" ? "success" : "warning"}
            title={
              report.status === "resolved"
                ? "This case is closed"
                : report.status === "rejected"
                  ? "This report was not published"
                  : "This case is not public yet"
            }
          >
            <p>{explainStatus(report.status)}</p>
            {ownerView?.reviewNotes ? (
              <p className="mt-2">
                <span className="font-medium text-ink">Reviewer’s note:</span>{" "}
                {ownerView.reviewNotes}
              </p>
            ) : null}
          </Callout>
        </div>
      ) : null}

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-10">
        {/* Photographs first in the source order as well as visually: on a
            phone this column stacks above the details, and the photograph is
            what a visitor is here to look at. */}
        <div className="space-y-6">
          <PhotoGallery photos={report.photos} personLabel={personLabel} />

          <Card>
            <CardBody className="space-y-3">
              <h2 className="font-display text-base font-semibold text-ink">
                Do you recognise {isMissing ? "them" : "this person"}?
              </h2>
              <p className="text-sm leading-relaxed text-ink-muted">
                Tell the police first if you have seen them recently. Then let Locora know so the
                reviewer handling this case can follow it up.
              </p>
              <ReportConcernButton
                kind={kind}
                reportId={report.id}
                signedIn={viewer !== null}
                variant="recognise"
              />
            </CardBody>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <header>
            <div className="flex flex-wrap items-center gap-2">
              <KindBadge kind={report.kind} />
              <StatusBadge status={report.status} />
              {isMissing ? (
                <span className="text-sm text-ink-muted" data-numeric>
                  Missing for {formatDuration(report.lastSeenAt)}
                </span>
              ) : null}
            </div>

            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              {isMissing ? report.fullName : "Unidentified person"}
            </h1>

            <p className="mt-2 text-base text-ink-muted">
              {isMissing
                ? `${report.age} years old · ${formatGender(report.gender)}`
                : `${formatAgeRange(report.estimatedAgeMin, report.estimatedAgeMax)} · ${formatGender(report.gender)}`}
            </p>
          </header>

          <Card>
            <CardHeader title={isMissing ? "Last seen" : "Where they were found"} />
            <CardBody>
              <DetailList>
                <Detail label="City">{isMissing ? report.lastSeenCity : report.foundCity}</Detail>
                <Detail label={isMissing ? "Date last seen" : "Date found"}>
                  {formatDateTime(isMissing ? report.lastSeenAt : report.foundAt)}
                </Detail>
                <Detail label="Area" wide>
                  {isMissing ? report.lastSeenAddress : report.foundAddress}
                </Detail>
              </DetailList>
            </CardBody>
          </Card>

          {/* Placed above the description, because "has anybody looked at this
              yet" is the question a reporter opens this page to answer, and it
              orients a stranger too. */}
          <Card>
            <CardHeader
              title="Case progress"
              description="What has happened to this report so far."
            />
            <CardBody>
              <CaseTimeline
                status={report.status}
                createdAt={report.createdAt}
                // Only on the owner and reviewer projections, so a stranger sees
                // the step without an invented date rather than a wrong one.
                reviewedAt={ownerView?.reviewedAt ?? null}
                hasMatch={matches.length > 0}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Description" />
            <CardBody>
              <DetailList>
                <Detail label="Height">{formatHeight(report.heightCm)}</Detail>
                <Detail label="Gender">{formatGender(report.gender)}</Detail>
                {isMissing ? (
                  <Detail label="What they were wearing" wide>
                    {report.clothingDescription ?? "Not recorded"}
                  </Detail>
                ) : null}
                <Detail label="Distinguishing features" wide>
                  {report.distinguishingFeatures ?? "Not recorded"}
                </Detail>
                {!isMissing ? (
                  <Detail label="Notes from whoever found them" wide>
                    {report.notes ?? "Not recorded"}
                  </Detail>
                ) : null}
              </DetailList>
            </CardBody>
          </Card>

          {/* Coordinates are optional throughout, so the map is only rendered
              when there are any — and the address above is always present as
              text, which is what makes the map an addition rather than the only
              copy of the location. */}
          {isMissing && report.lastSeenLatitude !== null && report.lastSeenLongitude !== null ? (
            <LocationMap
              latitude={report.lastSeenLatitude}
              longitude={report.lastSeenLongitude}
              label={`Last seen near ${report.lastSeenCity}`}
            />
          ) : null}
          {!isMissing && report.foundLatitude !== null && report.foundLongitude !== null ? (
            <LocationMap
              latitude={report.foundLatitude}
              longitude={report.foundLongitude}
              label={`Found near ${report.foundCity}`}
            />
          ) : null}

          {/* The private half of the case. Rendered only when the projection
              actually returned the fields — see hasOwnerDetails — so this block
              cannot leak by a template mistake, because there is nothing in the
              props to leak. */}
          {ownerView ? (
            <Card className="border-primary/25">
              <CardHeader
                title="Private to you"
                description="Visible to you and to Locora's reviewers only. Never shown on the public case."
                action={
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
                    <Lock aria-hidden className="size-3" />
                    Not public
                  </span>
                }
              />
              <CardBody>
                <DetailList>
                  <Detail label="Contact name">{ownerView.contactName}</Detail>
                  <Detail label="Contact phone">
                    <a
                      href={`tel:${ownerView.contactPhone}`}
                      className="inline-flex items-center gap-1.5 text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
                    >
                      <Phone aria-hidden className="size-3.5" />
                      {ownerView.contactPhone}
                    </a>
                  </Detail>
                  {ownerView.contactEmail ? (
                    <Detail label="Contact email">{ownerView.contactEmail}</Detail>
                  ) : null}
                  {isMissing && "policeReportNumber" in ownerView ? (
                    <Detail label="Police reference">
                      {ownerView.policeReportNumber ?? "Not recorded"}
                    </Detail>
                  ) : null}
                  {!isMissing && "currentWhereabouts" in ownerView ? (
                    <Detail label="Where they are now" wide>
                      {ownerView.currentWhereabouts ?? "Not recorded"}
                    </Detail>
                  ) : null}
                </DetailList>
              </CardBody>
            </Card>
          ) : null}

          {matches.length > 0 ? (
            <Card className="border-found/30">
              <CardHeader
                title="Possible matches"
                description="A reviewer has linked this case to another report. Nothing is confirmed until a person checks it."
              />
              <CardBody className="space-y-3">
                {matches.map((match) => {
                  const otherKind = isMissing ? "found" : "missing";
                  const otherId = isMissing ? match.found.id : match.missing.id;
                  return (
                    <div
                      key={match.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-sunken px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium text-ink">
                          <Link2 aria-hidden className="size-3.5 text-found" />
                          {isMissing
                            ? `Found in ${match.found.city} on ${formatDate(match.found.foundAt)}`
                            : `${match.missing.fullName}, missing from ${match.missing.city}`}
                        </p>
                        <p className="mt-0.5 text-xs capitalize text-ink-muted">
                          Match status: {match.status}
                        </p>
                      </div>
                      <ButtonLink
                        href={`/cases/${otherKind}/${otherId}`}
                        variant="secondary"
                        size="sm"
                      >
                        View that case
                      </ButtonLink>
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
            <p className="flex items-center gap-2 text-xs text-ink-subtle">
              <ShieldCheck aria-hidden className="size-3.5" />
              Reviewed and published by a person · Filed {formatDate(report.createdAt)}
            </p>

            <ReportConcernButton
              kind={kind}
              reportId={report.id}
              signedIn={viewer !== null}
              variant="concern"
            />
          </div>

          {report.viewerIsReviewer ? (
            <Callout tone="info" title="You are viewing this as a reviewer">
              <p>
                Actions for this case are in the{" "}
                <Link href="/review/queue" className="font-medium">
                  review console
                </Link>
                .
              </p>
            </Callout>
          ) : null}

          {isMissing && report.status === "published" ? (
            <Callout tone="warning" title="If you have just seen this person">
              <p className="flex items-start gap-2">
                <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Contact your local police first. Locora is not an emergency service and cannot
                  respond immediately.
                </span>
              </p>
            </Callout>
          ) : null}
        </div>
      </div>
    </div>
  );
}
