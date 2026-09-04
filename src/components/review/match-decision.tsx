"use client";

/**
 * Confirming or dismissing a possible match.
 *
 * ## Both directions are consequential
 *
 * Confirming resolves two cases and tells two families the person has been
 * found. Dismissing puts both back on the public feed and tells them it was not
 * them after all. Neither is a tidy-up action, so both are confirmed and both
 * dialogs spell out what the other people involved will be told.
 *
 * ## What the dialog says is what actually happens
 *
 * The wording mirrors `decideMatch` in the service layer: confirming moves both
 * reports to resolved and removes them from the feed; dismissing returns both
 * to published. A dialog that describes something other than the code's
 * behaviour is worse than no dialog, because a reviewer stops reading them.
 */

import { CheckCircle2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { Callout } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";

export function MatchDecision({
  matchId,
  personName,
}: {
  matchId: string;
  /** The named person on the missing side, so the dialog is about a case not an id. */
  personName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<"confirm" | "dismiss" | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function decide(status: "confirmed" | "dismissed") {
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch(`/api/review/matches/${matchId}`, {
        method: "PATCH",
        body: { status, notes: notes.trim() === "" ? null : notes.trim() },
      });
      setOpen(null);
      setNotes("");
      toast.success(
        status === "confirmed"
          ? "Match confirmed. Both cases are resolved and both reporters have been told."
          : "Match dismissed. Both cases are back on the public feed.",
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
        <Button size="sm" onClick={() => setOpen("confirm")}>
          <CheckCircle2 aria-hidden className="size-3.5" />
          Confirm match
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setOpen("dismiss")}>
          <XCircle aria-hidden className="size-3.5" />
          Not a match
        </Button>
      </div>

      <Dialog
        open={open === "confirm"}
        onClose={() => setOpen(null)}
        title="Confirm this is the same person?"
        description="Only do this once identity has actually been established."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={() => void decide("confirmed")}
              loading={submitting}
              loadingLabel="Confirming"
            >
              Yes, confirm the match
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error ? <Callout tone="danger">{error}</Callout> : null}

          <Callout tone="warning" title="What this does">
            <ul className="list-inside list-disc space-y-1">
              <li>Both cases are marked resolved and removed from the public feed.</li>
              <li>Both reporters are told the match has been confirmed.</li>
              <li>
                It cannot be undone from the console — a resolved case is terminal in the status
                machine.
              </li>
            </ul>
          </Callout>

          <Field label="Note" hint="Kept on the match record. Not shown to reporters.">
            {(props) => (
              <Textarea
                {...props}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Identity confirmed by the family at the hospital on 3 September."
              />
            )}
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={open === "dismiss"}
        onClose={() => setOpen(null)}
        title="Rule out this match"
        description={`${personName}'s case and the found-person report will both go back on the public feed.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => void decide("dismissed")}
              loading={submitting}
              loadingLabel="Dismissing"
            >
              Not the same person
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error ? <Callout tone="danger">{error}</Callout> : null}
          <p className="text-sm leading-relaxed text-ink-muted">
            Both reporters are told the possibility was checked and ruled out. That is important —
            they have been waiting on it since the link was made.
          </p>

          <Field label="Note" hint="Kept on the match record. Not shown to reporters.">
            {(props) => (
              <Textarea
                {...props}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Different height and no matching scar."
              />
            )}
          </Field>
        </div>
      </Dialog>
    </>
  );
}
