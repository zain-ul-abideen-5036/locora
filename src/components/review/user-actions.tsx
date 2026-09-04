"use client";

/**
 * Suspending an account, restoring it, and granting or removing review access.
 *
 * Every one is confirmed, and each dialog states the actual consequence rather
 * than asking "are you sure?". Suspending signs somebody out everywhere and
 * stops them filing; granting review access hands over the ability to read
 * every contact detail in the system. Neither is a thing to do by mis-clicking
 * a row in a table.
 *
 * The two guard rails that could not be undone from inside the product — you
 * cannot suspend yourself, and the last active reviewer cannot be demoted — are
 * enforced server-side. This surfaces those refusals rather than duplicating
 * the logic, so there is exactly one authority on them.
 */

import { ShieldCheck, ShieldOff, UserMinus, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { Callout } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";

export function UserActions({
  userId,
  email,
  isBanned,
  isAdmin,
  isSelf,
}: {
  userId: string;
  email: string;
  isBanned: boolean;
  isAdmin: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<"ban" | "unban" | "promote" | "demote" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function send(body: Record<string, unknown>, success: string) {
    setError(null);
    setWorking(true);
    try {
      await apiFetch(`/api/review/users/${userId}`, { method: "PATCH", body });
      setDialog(null);
      setReason("");
      toast.success(success);
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {isBanned ? (
          <Button size="sm" variant="secondary" onClick={() => setDialog("unban")}>
            <UserPlus aria-hidden className="size-3.5" />
            Restore
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setDialog("ban")}
            // The server refuses self-suspension; disabling it here means a
            // reviewer is not invited to try.
            disabled={isSelf}
            title={isSelf ? "You cannot suspend your own account" : undefined}
          >
            <UserMinus aria-hidden className="size-3.5" />
            Suspend
          </Button>
        )}

        {isAdmin ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDialog("demote")}
            disabled={isSelf}
            title={isSelf ? "You cannot remove your own review access" : undefined}
          >
            <ShieldOff aria-hidden className="size-3.5" />
            Remove review access
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setDialog("promote")}>
            <ShieldCheck aria-hidden className="size-3.5" />
            Grant review access
          </Button>
        )}
      </div>

      <Dialog
        open={dialog === "ban"}
        onClose={() => setDialog(null)}
        title="Suspend this account"
        description={email}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={working}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                void send(
                  { isBanned: true, reason: reason.trim() === "" ? null : reason.trim() },
                  "Account suspended and signed out everywhere.",
                )
              }
              loading={working}
              loadingLabel="Suspending"
            >
              Suspend account
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error ? <Callout tone="danger">{error}</Callout> : null}
          <Callout tone="warning" title="What this does">
            <ul className="list-inside list-disc space-y-1">
              <li>Signs them out on every device immediately.</li>
              <li>Stops them signing in or filing anything new.</li>
              <li>
                Leaves their existing reports alone. A suspended reporter&rsquo;s published case may
                still be about a real missing person — take those down individually if they need it.
              </li>
            </ul>
          </Callout>

          <Field label="Reason" hint="Kept on the account record for other reviewers.">
            {(props) => (
              <Textarea
                {...props}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Repeatedly filing fabricated reports after a warning."
              />
            )}
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={dialog === "unban"}
        onClose={() => setDialog(null)}
        title="Restore this account"
        description={email}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={working}>
              Cancel
            </Button>
            <Button
              onClick={() => void send({ isBanned: false, reason: null }, "Account restored.")}
              loading={working}
              loadingLabel="Restoring"
            >
              Restore account
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error ? <Callout tone="danger">{error}</Callout> : null}
          <p className="text-sm text-ink-muted">
            They will be able to sign in and file reports again, and will be notified.
          </p>
        </div>
      </Dialog>

      <Dialog
        open={dialog === "promote"}
        onClose={() => setDialog(null)}
        title="Grant review access"
        description={email}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={working}>
              Cancel
            </Button>
            <Button
              onClick={() => void send({ role: "admin" }, "Review access granted.")}
              loading={working}
              loadingLabel="Granting"
            >
              Grant access
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error ? <Callout tone="danger">{error}</Callout> : null}
          <Callout tone="warning" title="This is the most privileged thing you can grant">
            A reviewer can read every contact detail and private field on every case, publish and
            take down reports, link two families&rsquo; cases together, and suspend accounts.
          </Callout>
        </div>
      </Dialog>

      <Dialog
        open={dialog === "demote"}
        onClose={() => setDialog(null)}
        title="Remove review access"
        description={email}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={working}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => void send({ role: "user" }, "Review access removed.")}
              loading={working}
              loadingLabel="Removing"
            >
              Remove access
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error ? <Callout tone="danger">{error}</Callout> : null}
          <p className="text-sm text-ink-muted">
            They keep their account and their own reports, but lose the review console. Locora
            refuses this if they are the only active reviewer left.
          </p>
        </div>
      </Dialog>
    </>
  );
}
