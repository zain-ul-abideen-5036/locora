import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Callout } from "@/components/ui/feedback";
import { requireUser } from "@/server/auth/current-user";

import { FoundReportForm } from "./found-report-form";

export const metadata: Metadata = {
  title: "Report someone found",
  robots: { index: false, follow: false },
};

export default async function ReportFoundPage() {
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
          Report someone found
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-muted">
          For a person who cannot say who they are or where they belong. Record only what you can
          actually observe — a guess you are unsure of is less useful than a blank.
        </p>
      </header>

      <div className="mt-6">
        <Callout tone="warning" title="Make sure they are safe first">
          If this person needs medical attention or is at risk, contact your local emergency
          services and the police before filing here. Locora is a register, not a response service.
        </Callout>
      </div>

      {!user.isEmailVerified ? (
        <div className="mt-4">
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
        <FoundReportForm canSubmit={user.isEmailVerified} />
      </div>
    </div>
  );
}
