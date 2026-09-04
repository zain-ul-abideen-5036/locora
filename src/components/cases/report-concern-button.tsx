"use client";

/**
 * "I recognise this person" and "Report a concern".
 *
 * One component for both, because both open the same dialog and file the same
 * record — an abuse report with a reason. The two entry points differ only in
 * their wording and which reason is preselected, and splitting them into two
 * components would duplicate the dialog, the submit and the error handling to
 * change two strings.
 *
 * ## Sighting reports and abuse reports share a table
 *
 * A sighting is filed with `reason: "other"` and the details the reporter
 * types. That is a deliberate reuse rather than a shortcut: both are "a member
 * of the public has something to tell a reviewer about this case", both need to
 * arrive in the same queue, and both need the same rate limit and the same
 * one-open-flag-per-person constraint. A separate table would duplicate all of
 * it to hold the same three columns.
 *
 * ## Why it requires a session
 *
 * Anonymous submissions would make this a free tool for burying a genuine case
 * under noise, with nobody to hold responsible. Somebody not signed in is shown
 * where to go rather than a disabled button with no explanation.
 */

import { Eye, Flag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Callout } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";

const REASONS = [
  { value: "other", label: "I have information about this person" },
  { value: "fabricated_report", label: "This report looks fabricated" },
  { value: "inappropriate_content", label: "The content is inappropriate" },
  { value: "privacy_concern", label: "This should not be published" },
  { value: "spam", label: "This is spam" },
] as const;

export function ReportConcernButton({
  kind,
  reportId,
  signedIn,
  variant,
}: {
  kind: "missing" | "found";
  reportId: string;
  signedIn: boolean;
  variant: "recognise" | "concern";
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(variant === "recognise" ? "other" : "fabricated_report");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isRecognise = variant === "recognise";

  /**
   * Not signed in: sent to sign-in rather than shown a form that cannot submit.
   *
   * `?next=` returns them to this case afterwards, so they do not have to find
   * it again — which on a feed of hundreds of cases is a real risk of losing
   * the sighting entirely.
   */
  if (!signedIn) {
    const signInHref = `/login?next=${encodeURIComponent(`/cases/${kind}/${reportId}`)}`;

    return isRecognise ? (
      <ButtonLink href={signInHref} variant="secondary" className="w-full">
        <Eye aria-hidden className="size-4" />
        Sign in to tell us
      </ButtonLink>
    ) : (
      <Link
        href={signInHref}
        className="inline-flex items-center gap-1.5 text-xs text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
      >
        <Flag aria-hidden className="size-3" />
        Report a concern
      </Link>
    );
  }

  async function submit() {
    setError(null);

    if (details.trim().length < 10) {
      setError("Please add a little more detail — at least ten characters.");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/api/reports/flags", {
        method: "POST",
        body: {
          missingReportId: kind === "missing" ? reportId : null,
          foundReportId: kind === "found" ? reportId : null,
          reason,
          details: details.trim(),
        },
      });
      setOpen(false);
      setDetails("");
      toast.success("Thank you. A reviewer will look at this.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {isRecognise ? (
        <Button variant="secondary" onClick={() => setOpen(true)} className="w-full">
          <Eye aria-hidden className="size-4" />
          I recognise them
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
        >
          <Flag aria-hidden className="size-3" />
          Report a concern
        </button>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={isRecognise ? "Tell us what you know" : "Report a concern"}
        description={
          isRecognise
            ? "This goes to the reviewer handling this case. If you have seen them recently, contact the police first."
            : "This goes to Locora's reviewers. Tell us what is wrong with this case."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} loading={submitting} loadingLabel="Sending">
              Send to a reviewer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <Callout tone="danger">{error}</Callout> : null}

          <Field label="What is this about?" required>
            {(props) => (
              <Select {...props} value={reason} onChange={(event) => setReason(event.target.value)}>
                {REASONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label="Details"
            hint={
              isRecognise
                ? "Where and when did you see them, and anything else that might help. Do not include your own phone number — a reviewer will contact you through your account."
                : "What is wrong with this case?"
            }
            required
          >
            {(props) => (
              <Textarea
                {...props}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                rows={5}
                maxLength={1000}
                placeholder={
                  isRecognise
                    ? "I think I saw this person on…"
                    : "This report appears to be…"
                }
              />
            )}
          </Field>

          <p className="text-xs leading-relaxed text-ink-subtle">
            Locora is not an emergency service. If someone is in immediate danger, contact your
            local emergency number.
          </p>
        </div>
      </Dialog>
    </>
  );
}
