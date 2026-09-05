"use client";

/**
 * The publish / decline / hold controls on a queued report.
 *
 * ## Declining requires a reason, and the dialog enforces it
 *
 * The server also requires it (see `assertReviewNotes`), but a reviewer should
 * not discover that by having a submission refused. The note is shown verbatim
 * to the reporter, and "your report about your missing daughter was not
 * published" with no explanation is not something this product will send.
 *
 * ## Publishing is confirmed too
 *
 * Not because it is dangerous to get wrong in the same way, but because it is
 * irreversible in the way that matters: the moment a case is published, a
 * stranger can see a photograph of a named child. A one-click publish on a
 * queue somebody is working through quickly is how the wrong case goes live.
 *
 * ## Why a full refresh after a decision
 *
 * `router.refresh()` re-renders the server component, which re-reads the queue
 * and the counts in the console navigation. Removing the row client-side would
 * leave the badge in the sidebar disagreeing with the list next to it.
 */

import { CheckCircle2, Eye, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { Callout } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { ReportStatus } from "@/db/enums";

type Action = "publish" | "decline" | "hold" | null;

export function ReviewDecision({
  kind,
  reportId,
  personLabel,
  currentStatus,
}: {
  kind: "missing" | "found";
  reportId: string;
  /** Named in the confirmation, so a reviewer sees which case they are acting on. */
  personLabel: string;
  currentStatus: ReportStatus;
}) {
  const router = useRouter();
  const toast = useToast();
  const [action, setAction] = useState<Action>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function decide(status: ReportStatus, reviewNotes: string | null) {
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch(`/api/review/reports/${kind}/${reportId}`, {
        method: "PATCH",
        body: { status, reviewNotes },
      });
      setAction(null);
      setNotes("");
      toast.success(
        status === "published"
          ? "Published. It is on the public feed and the reporter has been told."
          : status === "rejected"
            ? "Declined. The reporter has been sent your note."
            : "Marked as in review.",
      );
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setAction("publish")}>
          <CheckCircle2 aria-hidden className="size-3.5" />
          Publish
        </Button>

        {currentStatus === "pending" ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void decide("under_review", null)}
            loading={submitting && action === null}
            loadingLabel="Updating"
          >
            <Eye aria-hidden className="size-3.5" />
            Mark in review
          </Button>
        ) : null}

        {/*
          Set apart from the other two, and tinted.

          Decline was previously identical to "Mark in review" — same variant,
          same size, immediately adjacent — so the one action that sends a
          family a written refusal looked exactly like the one that changes a
          status nobody sees. The confirmation dialog catches a misclick, but a
          control that relies on its own confirmation to be safe is a control
          that is asking the wrong question.

          Tinted rather than filled red: a queue of twenty rows each carrying a
          solid red button reads as an interface urging you to decline things.
          The full danger treatment belongs on the confirming button inside the
          dialog, where the decision is actually taken, and that is where it is.
        */}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setAction("decline")}
          // `sm:ml-3` rather than `ml-auto`. Measured: this row is a
          // shrink-to-fit flex container, so `ml-auto` had no free space to
          // consume and the three buttons stayed 8px apart on a desktop — it
          // only bit on a phone, where the button wraps and the line is full
          // width. An explicit margin separates it at the width where all
          // three sit together, and is left off the phone, where a stray
          // indent on a wrapped button reads as a mistake.
          className="border-critical/35 text-critical-fg hover:border-critical/60 hover:bg-critical-soft sm:ml-3"
        >
          <XCircle aria-hidden className="size-3.5" />
          Decline
        </Button>
      </div>

      <Dialog
        open={action === "publish"}
        onClose={() => setAction(null)}
        title="Publish this case?"
        description={`${personLabel} will appear on the public case feed, and the reporter will be notified.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAction(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={() => void decide("published", null)}
              loading={submitting}
              loadingLabel="Publishing"
            >
              Publish case
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error ? <Callout tone="danger">{error}</Callout> : null}
          <p className="text-sm leading-relaxed text-ink-muted">
            Check the photograph and the description first. Once published, anyone can see them —
            and a case published in error is visible until somebody takes it down.
          </p>
        </div>
      </Dialog>

      <Dialog
        open={action === "decline"}
        onClose={() => setAction(null)}
        title="Decline this report"
        description="The reporter is shown your note. Write it for them, not for the log."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAction(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => void decide("rejected", notes.trim())}
              loading={submitting}
              loadingLabel="Declining"
              // Mirrors the server's rule, so the reviewer is stopped here
              // rather than by a refused request.
              disabled={notes.trim().length < 10}
            >
              Decline report
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error ? <Callout tone="danger">{error}</Callout> : null}

          <Field
            label="Why is this not being published?"
            hint="At least ten characters. The reporter reads this and can file again, so say what would need to change."
            required
          >
            {(props) => (
              <Textarea
                {...props}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="We could not verify this report. Please add a police reference number and file again."
              />
            )}
          </Field>
        </div>
      </Dialog>
    </>
  );
}
