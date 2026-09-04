import { ScrollText } from "lucide-react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { formatCount, formatDateTime } from "@/lib/format";
import { listAuditEntries } from "@/server/admin/audit";
import { requireAdmin } from "@/server/auth/current-user";

export const dynamic = "force-dynamic";

/**
 * The audit trail.
 *
 * Every privileged action, newest first, with who did it. This exists because
 * an unaccountable moderator action is not acceptable on a platform holding
 * missing-person data — a reviewer can hide a case, unhide it, link two
 * families' reports together or suspend an account, and each of those needs to
 * be answerable for afterwards.
 *
 * The entries carry no personal data. `recordAudit` strips anything that looks
 * like it, deliberately: a JSONB metadata column makes it tempting to snapshot
 * whole rows, which would turn the log into a second unredacted copy of exactly
 * what it audits — one that no projection filters and that is kept forever.
 * What is stored is the transition and the identifiers, which is what answers
 * "who changed this, and to what".
 */

const ACTION_PRESENTATION: Record<string, { label: string; tone: BadgeTone }> = {
  "report.status_changed": { label: "Report status changed", tone: "primary" },
  "report.photos_removed": { label: "Photographs removed", tone: "caution" },
  "match.created": { label: "Match created", tone: "found" },
  "match.confirmed": { label: "Match confirmed", tone: "positive" },
  "match.dismissed": { label: "Match dismissed", tone: "neutral" },
  "abuse_report.resolved": { label: "Flag handled", tone: "neutral" },
  "user.banned": { label: "Account suspended", tone: "critical" },
  "user.unbanned": { label: "Account restored", tone: "positive" },
  "user.role_changed": { label: "Role changed", tone: "caution" },
};

const TARGET_LABELS: Record<string, string> = {
  missing_report: "missing-person report",
  found_report: "found-person report",
  match: "match",
  abuse_report: "flag",
  user: "account",
};

export default async function ReviewAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>;
}) {
  await requireAdmin();
  const { offset: rawOffset } = await searchParams;
  const offset = Math.max(Number(rawOffset ?? 0) || 0, 0);

  const { items, total } = await listAuditEntries({ limit: 50, offset });

  return (
    <div>
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Audit trail
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          {formatCount(total)} recorded {total === 1 ? "action" : "actions"}. Entries cannot be
          edited or removed, and they outlive the account that created them.
        </p>
      </div>

      <div className="mt-6">
        {items.length === 0 ? (
          <EmptyState
            icon={<ScrollText aria-hidden className="size-5" />}
            title="Nothing recorded yet"
            description="Publishing a report, linking a match or suspending an account will appear here."
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <CardBody className="p-0">
              <ul className="divide-y divide-line">
                {items.map((entry) => {
                  const presentation =
                    ACTION_PRESENTATION[entry.action] ?? {
                      label: entry.action,
                      tone: "neutral" as BadgeTone,
                    };
                  const transition = describeTransition(entry.metadata);

                  return (
                    <li key={entry.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
                      <Badge tone={presentation.tone} className="mt-0.5">
                        {presentation.label}
                      </Badge>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink">
                          <span className="font-medium">
                            {entry.actorName ?? entry.actorEmail ?? "A removed account"}
                          </span>{" "}
                          <span className="text-ink-muted">
                            acted on a {TARGET_LABELS[entry.targetType] ?? entry.targetType}
                            {transition ? ` — ${transition}` : ""}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-ink-subtle" data-numeric>
                          {formatDateTime(entry.createdAt)}
                          {entry.actorEmail ? ` · ${entry.actorEmail}` : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        )}

        {total > items.length + offset || offset > 0 ? (
          <nav aria-label="Audit pagination" className="mt-5 flex items-center justify-between gap-4">
            {offset > 0 ? (
              <a
                href={`/review/audit?offset=${Math.max(offset - 50, 0)}`}
                className="text-sm text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
              >
                Newer
              </a>
            ) : (
              <span />
            )}
            {offset + items.length < total ? (
              <a
                href={`/review/audit?offset=${offset + 50}`}
                className="text-sm text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
              >
                Older
              </a>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Renders the `{from, to}` snapshot as a phrase.
 *
 * Reads defensively because this is a JSONB column: an entry written by an
 * older version of the code may not carry the keys this one expects, and an
 * audit page that throws on a historical row is an audit page nobody can use.
 */
function describeTransition(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;

  const from = typeof metadata.from === "string" ? metadata.from.replace(/_/g, " ") : null;
  const to = typeof metadata.to === "string" ? metadata.to.replace(/_/g, " ") : null;

  if (from && to) return `${from} → ${to}`;
  if (to) return `set to ${to}`;
  if (typeof metadata.reportStatus === "string") {
    return `reports set to ${metadata.reportStatus.replace(/_/g, " ")}`;
  }
  return null;
}
