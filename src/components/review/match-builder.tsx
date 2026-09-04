"use client";

/**
 * Linking a missing-person case to a found-person report.
 *
 * ## Suggestions, not a verdict
 *
 * Choosing a missing case fetches ranked candidates. The ranking is entirely
 * explainable — age overlap, gender, city, timing — and every candidate lists
 * the reasons it scored, so a reviewer can see that something ranked highly
 * because of the city rather than reading the number as a likelihood. That is
 * the whole reason the reasons are shown: a bare "87%" next to a photograph
 * invites a reviewer to trust arithmetic instead of judgement, on a decision
 * where being wrong means telling a family something untrue about their child.
 *
 * ## The link is a possibility, and says so
 *
 * Creating one sets the match to `possible` and notifies both reporters that it
 * is unconfirmed. Nothing here resolves a case.
 */

import { ArrowRight, Link2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatAgeRange, formatDate, formatGender } from "@/lib/format";

export interface MatchableMissing {
  id: string;
  fullName: string;
  age: number;
  city: string;
  lastSeenAt: string;
}

interface Candidate {
  foundReportId: string;
  city: string;
  foundAt: string;
  estimatedAgeMin: number | null;
  estimatedAgeMax: number | null;
  gender: string;
  score: number;
  reasons: string[];
}

export function MatchBuilder({ missingReports }: { missingReports: MatchableMissing[] }) {
  const router = useRouter();
  const toast = useToast();

  const [selectedId, setSelectedId] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selected = missingReports.find((report) => report.id === selectedId);

  async function loadCandidates(missingReportId: string) {
    setSelectedId(missingReportId);
    setCandidates(null);
    setError(null);
    if (!missingReportId) return;

    setLoading(true);
    try {
      const result = await apiFetch<{ items: Candidate[] }>(
        `/api/review/candidates?missingReportId=${encodeURIComponent(missingReportId)}`,
      );
      setCandidates(result.items);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function link(foundReportId: string) {
    setError(null);
    setLinkingId(foundReportId);
    try {
      await apiFetch("/api/review/matches", {
        method: "POST",
        body: {
          missingReportId: selectedId,
          foundReportId,
          notes: notes.trim() === "" ? null : notes.trim(),
        },
      });
      toast.success("Linked as a possible match. Both reporters have been told it is unconfirmed.");
      setNotes("");
      // Re-fetched rather than filtered client-side: the newly linked candidate
      // is excluded by the query, and the console's counts need to change too.
      await loadCandidates(selectedId);
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLinkingId(null);
    }
  }

  if (missingReports.length === 0) {
    return (
      <EmptyState
        icon={<Link2 aria-hidden className="size-5" />}
        title="No published missing-person cases"
        description="A case has to be published before it can be linked. Work through the review queue first."
      />
    );
  }

  return (
    <Card>
      <CardHeader
        title="Look for a match"
        description="Pick a missing-person case and Locora will rank the found-person reports worth comparing."
      />
      <CardBody className="space-y-5">
        {error ? <Callout tone="danger">{error}</Callout> : null}

        <Field label="Missing-person case" required>
          {(props) => (
            <Select
              {...props}
              value={selectedId}
              onChange={(event) => void loadCandidates(event.target.value)}
            >
              <option value="">Choose a case…</option>
              {missingReports.map((report) => (
                <option key={report.id} value={report.id}>
                  {report.fullName}, {report.age} — {report.city}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {loading ? (
          <p aria-live="polite" className="text-sm text-ink-muted">
            Ranking found-person reports…
          </p>
        ) : null}

        {selected && candidates !== null ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-line bg-surface-sunken px-4 py-3">
              <p className="text-sm font-medium text-ink">
                Comparing against {selected.fullName}, {selected.age}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                Last seen {selected.city}, {formatDate(selected.lastSeenAt)} ·{" "}
                <Link
                  href={`/cases/missing/${selected.id}`}
                  className="text-accent underline decoration-line-strong underline-offset-4"
                >
                  open the case
                </Link>
              </p>
            </div>

            <Field
              label="Note for this link"
              hint="Kept on the match record. Not shown to reporters."
            >
              {(props) => (
                <Textarea
                  {...props}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                  maxLength={1000}
                  placeholder="Same city and a matching description of the jacket."
                />
              )}
            </Field>

            {candidates.length === 0 ? (
              <EmptyState
                icon={<Sparkles aria-hidden className="size-5" />}
                title="No found-person reports to compare"
                description="Either none are published, or every one has already been linked to this case."
              />
            ) : (
              <ul className="space-y-3">
                {candidates.map((candidate) => (
                  <li
                    key={candidate.foundReportId}
                    className="rounded-lg border border-line bg-surface p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">
                          Found in {candidate.city} on {formatDate(candidate.foundAt)}
                        </p>
                        <p className="mt-0.5 text-sm text-ink-muted">
                          {formatAgeRange(candidate.estimatedAgeMin, candidate.estimatedAgeMax)} ·{" "}
                          {formatGender(candidate.gender as "male" | "female" | "other" | "unknown")}
                        </p>
                      </div>

                      {/*
                        Labelled "attributes in common", not "confidence" or a
                        percentage. It counts how many cheap checks agreed; it
                        is not a probability, and naming it as one would be a
                        lie with consequences.
                      */}
                      <Badge tone={candidate.score >= 65 ? "found" : "neutral"}>
                        {candidate.reasons.length} in common
                      </Badge>
                    </div>

                    <ul className="mt-3 space-y-1">
                      {candidate.reasons.map((reason) => (
                        <li key={reason} className="flex items-start gap-2 text-sm text-ink-muted">
                          <span
                            aria-hidden
                            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-found"
                          />
                          {reason}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                      <Link
                        href={`/cases/found/${candidate.foundReportId}`}
                        className="text-sm text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
                      >
                        Open the found-person case
                      </Link>
                      <Button
                        size="sm"
                        className="ml-auto"
                        onClick={() => void link(candidate.foundReportId)}
                        loading={linkingId === candidate.foundReportId}
                        loadingLabel="Linking"
                      >
                        Link as possible match
                        <ArrowRight aria-hidden className="size-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
