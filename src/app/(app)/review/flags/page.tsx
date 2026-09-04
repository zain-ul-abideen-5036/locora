import { Flag } from "lucide-react";
import Link from "next/link";

import { ResolveFlagButton } from "@/components/review/resolve-flag-button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { formatRelative } from "@/lib/format";
import { requireAdmin } from "@/server/auth/current-user";
import { listOpenAbuseReports } from "@/server/reports/service";

export const dynamic = "force-dynamic";

/**
 * Flagged cases and public sightings.
 *
 * Both arrive through the same route, because both are "a member of the public
 * has something to tell a reviewer about this case". The reason distinguishes
 * them, and a sighting is presented first-class rather than buried among
 * complaints — somebody reporting that they recognise a missing person is the
 * single most valuable message this platform can receive.
 */
const REASON_PRESENTATION: Record<string, { label: string; tone: BadgeTone }> = {
  other: { label: "Information about this person", tone: "found" },
  fabricated_report: { label: "Possibly fabricated", tone: "critical" },
  inappropriate_content: { label: "Inappropriate content", tone: "critical" },
  privacy_concern: { label: "Privacy concern", tone: "caution" },
  spam: { label: "Spam", tone: "neutral" },
};

export default async function ReviewFlagsPage() {
  await requireAdmin();
  const flags = await listOpenAbuseReports();

  // Sightings first: they are time-sensitive in a way a spam complaint is not.
  const sorted = [...flags].sort((a, b) => {
    const aSighting = a.reason === "other" ? 0 : 1;
    const bSighting = b.reason === "other" ? 0 : 1;
    return aSighting - bSighting || a.createdAt.localeCompare(b.createdAt);
  });

  return (
    <div>
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Flagged cases
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          Messages from the public about a case — a sighting, or a problem with the report.
          Sightings are listed first.
        </p>
      </div>

      <div className="mt-6">
        {sorted.length === 0 ? (
          <EmptyState
            icon={<Flag aria-hidden className="size-5" />}
            title="Nothing flagged"
            description="No open messages about any case."
          />
        ) : (
          <ul className="space-y-3">
            {sorted.map((flag) => {
              const presentation =
                REASON_PRESENTATION[flag.reason] ?? { label: flag.reason, tone: "neutral" as BadgeTone };

              return (
                <li key={flag.id}>
                  <Card>
                    <CardBody className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={presentation.tone}>{presentation.label}</Badge>
                        <span className="text-xs text-ink-muted">
                          {formatRelative(flag.createdAt)}
                        </span>
                      </div>

                      {flag.details ? (
                        <p className="whitespace-pre-line rounded-md border border-line bg-surface-sunken px-3 py-2 text-sm leading-relaxed text-ink">
                          {flag.details}
                        </p>
                      ) : (
                        <p className="text-sm italic text-ink-subtle">No details given.</p>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                        <Link
                          href={`/cases/${flag.kind}/${flag.reportId}`}
                          className="text-sm text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
                        >
                          Open the {flag.kind === "missing" ? "missing-person" : "found-person"} case
                        </Link>
                        <ResolveFlagButton flagId={flag.id} />
                      </div>
                    </CardBody>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
