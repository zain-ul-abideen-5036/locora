import { Link2 } from "lucide-react";
import Link from "next/link";

import { MatchBuilder, type MatchableMissing } from "@/components/review/match-builder";
import { MatchDecision } from "@/components/review/match-decision";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { formatAgeRange, formatDate, formatRelative } from "@/lib/format";
import { requireAdmin } from "@/server/auth/current-user";
import { listMatches } from "@/server/matches/service";
import { listMissingFeed } from "@/server/reports/queries";

export const dynamic = "force-dynamic";

/**
 * Matches.
 *
 * Two sections, in the order a reviewer needs them: the links already made and
 * awaiting a decision, then the tool for making a new one. Open work first —
 * a possible match is two families waiting, and it should not be below a form.
 */
export default async function ReviewMatchesPage() {
  const reviewer = await requireAdmin();

  const [open, decided, publishedMissing] = await Promise.all([
    listMatches("possible"),
    // Only the confirmed ones. A dismissed match is a decision that has been
    // taken and its reports are back on the feed; listing them here would fill
    // the page with resolved noise. They remain in the audit trail.
    listMatches("confirmed"),
    listMissingFeed({}, { offset: 0, limit: 200 }, reviewer),
  ]);

  const matchable: MatchableMissing[] = publishedMissing.items.map((report) => ({
    id: report.id,
    fullName: report.fullName,
    age: report.age,
    city: report.lastSeenCity,
    lastSeenAt: report.lastSeenAt,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">Matches</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          A link between a missing-person case and a found-person report. Nothing is confirmed
          until you confirm it, and nothing here is decided by software.
        </p>
      </div>

      <section aria-labelledby="open-matches">
        <h3 id="open-matches" className="font-display text-lg font-semibold text-ink">
          Awaiting a decision
          {open.length > 0 ? (
            <span className="ml-2 text-sm font-normal text-ink-muted">
              {open.length} {open.length === 1 ? "match" : "matches"}
            </span>
          ) : null}
        </h3>

        <div className="mt-4">
          {open.length === 0 ? (
            <EmptyState
              icon={<Link2 aria-hidden className="size-5" />}
              title="No open matches"
              description="Nothing is waiting on a decision. Use the tool below to look for a new link."
            />
          ) : (
            <ul className="space-y-4">
              {open.map((match) => (
                <li key={match.id}>
                  <Card className="border-found/30">
                    <CardBody className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="found">Possible match</Badge>
                        <span className="text-xs text-ink-muted">
                          linked {formatRelative(match.createdAt)}
                        </span>
                        {match.source === "automated" ? (
                          // Nothing writes this today, but if an assisted
                          // matcher is added the console must show which links
                          // came from it. A reviewer confirming a machine
                          // suggestion should know that is what they are doing.
                          <Badge tone="caution">Suggested automatically</Badge>
                        ) : null}
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-lg border border-missing/30 bg-missing-soft/40 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-missing-fg">
                            Missing
                          </p>
                          <p className="mt-1 font-display text-base font-semibold text-ink">
                            {match.missing.fullName}, {match.missing.age}
                          </p>
                          <p className="mt-0.5 text-sm text-ink-muted">
                            {match.missing.city} · last seen {formatDate(match.missing.lastSeenAt)}
                          </p>
                          <Link
                            href={`/cases/missing/${match.missing.id}`}
                            className="mt-2 inline-block text-sm text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
                          >
                            Open case
                          </Link>
                        </div>

                        <div className="rounded-lg border border-found/30 bg-found-soft/40 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-found-fg">
                            Found
                          </p>
                          <p className="mt-1 font-display text-base font-semibold text-ink">
                            {formatAgeRange(match.found.estimatedAgeMin, match.found.estimatedAgeMax)}
                          </p>
                          <p className="mt-0.5 text-sm text-ink-muted">
                            {match.found.city} · found {formatDate(match.found.foundAt)}
                          </p>
                          <Link
                            href={`/cases/found/${match.found.id}`}
                            className="mt-2 inline-block text-sm text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
                          >
                            Open case
                          </Link>
                        </div>
                      </div>

                      {match.notes ? (
                        <p className="rounded-md border border-line bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
                          <span className="font-medium text-ink">Note:</span> {match.notes}
                        </p>
                      ) : null}

                      <div className="border-t border-line pt-3">
                        <MatchDecision matchId={match.id} personName={match.missing.fullName} />
                      </div>
                    </CardBody>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="find-match">
        <h3 id="find-match" className="sr-only">
          Look for a match
        </h3>
        <MatchBuilder missingReports={matchable} />
      </section>

      {decided.length > 0 ? (
        <section aria-labelledby="confirmed-matches">
          <h3 id="confirmed-matches" className="font-display text-lg font-semibold text-ink">
            Confirmed
          </h3>
          <ul className="mt-4 space-y-2">
            {decided.slice(0, 20).map((match) => (
              <li
                key={match.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {match.missing.fullName} · found in {match.found.city}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    confirmed {match.decidedAt ? formatRelative(match.decidedAt) : "—"}
                  </p>
                </div>
                <Badge tone="positive">Resolved</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
