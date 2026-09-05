import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Callout } from "@/components/ui/feedback";
import { requireUser } from "@/server/auth/current-user";

import { MissingReportForm } from "./missing-report-form";

export const metadata: Metadata = {
  title: "Report a missing person",
  robots: { index: false, follow: false },
};

export default async function ReportMissingPage() {
  // `requireUser`, not `requireVerifiedUser`. An unconfirmed account is allowed
  // to *see* the form and read what it asks for — being turned away at the door
  // with no idea what was wanted is worse than being told at the bottom. The
  // submit button is disabled and the API refuses it regardless.
  const user = await requireUser();

  return (
    <div className="container-page max-w-5xl py-10 sm:py-14">
      <Link
        href="/report"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        Back
      </Link>

      <header className="mt-5 max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Report a missing person
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-muted">
          Only the name is essential. Everything else helps, and anything you are unsure of can be
          left blank — a reviewer can come back to you.
        </p>
      </header>

      {!user.isEmailVerified ? (
        <div className="mt-6">
          <Callout tone="warning" title="Confirm your email address to file">
            <p>
              We sent a link to <span className="font-medium text-ink">{user.email}</span>. You can
              read through the form now, but it cannot be filed until the address is confirmed.
            </p>
            <p className="mt-2">
              <Link href="/dashboard" className="font-medium">
                Resend the confirmation link
              </Link>
            </p>
          </Callout>
        </div>
      ) : null}

      <div className="mt-8">
        <MissingReportForm canSubmit={user.isEmailVerified} />
      </div>
    </div>
  );
}
