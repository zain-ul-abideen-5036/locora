"use client";

import { CheckCircle2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useSession } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { apiFetch, errorMessage } from "@/lib/api-client";

type State = "ready" | "working" | "done" | "failed";

export function VerifyEmailClient({ token }: { token: string }) {
  const router = useRouter();
  const { user, refresh } = useSession();
  const [state, setState] = useState<State>("ready");
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setState("working");
    setError(null);
    try {
      await apiFetch("/api/auth/verify-email", { method: "POST", body: { token } });
      setState("done");
      // The session's isEmailVerified is now stale in both the client context
      // and the server-rendered layout, so both are refreshed.
      await refresh();
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      setState("failed");
    }
  }

  if (state === "done") {
    return (
      <div>
        <div className="flex size-11 items-center justify-center rounded-xl bg-positive-soft text-positive">
          <CheckCircle2 aria-hidden className="size-5" />
        </div>
        <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-ink">
          Your email is confirmed
        </h1>
        <p className="mt-2 text-base text-ink-muted">
          You can file reports now, and you will receive updates on your cases.
        </p>

        <div className="mt-8 flex flex-col gap-2 sm:flex-row">
          {user ? (
            <>
              <Button size="lg" className="w-full" onClick={() => router.push("/report")}>
                File a report
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="w-full"
                onClick={() => router.push("/dashboard")}
              >
                My dashboard
              </Button>
            </>
          ) : (
            <Button size="lg" className="w-full" onClick={() => router.push("/login?verified=1")}>
              Sign in
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <MailCheck aria-hidden className="size-5" />
      </div>
      <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-ink">
        Confirm your email address
      </h1>
      <p className="mt-2 text-base text-ink-muted">
        One click and you are done. Confirming your address is what lets you file a report.
      </p>

      {state === "failed" && error ? (
        <div className="mt-6">
          <Callout tone="danger" title="Could not confirm your address">
            <p>{error}</p>
            <p className="mt-2">
              Links expire after 24 hours and work once.{" "}
              {user ? (
                <Link href="/dashboard" className="font-medium">
                  Request a new one from your dashboard
                </Link>
              ) : (
                <Link href="/login" className="font-medium">
                  Sign in to request a new one
                </Link>
              )}
              .
            </p>
          </Callout>
        </div>
      ) : null}

      <div className="mt-8">
        <Button
          size="lg"
          className="w-full"
          loading={state === "working"}
          loadingLabel="Confirming your address"
          onClick={() => void confirm()}
        >
          {state === "failed" ? "Try again" : "Confirm my email address"}
        </Button>
      </div>
    </div>
  );
}
