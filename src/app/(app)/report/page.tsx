import { ArrowRight, UserCheck, UserSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { requireUser } from "@/server/auth/current-user";

export const metadata: Metadata = {
  title: "File a report",
  robots: { index: false, follow: false },
};

/**
 * The fork between the two report types.
 *
 * A separate page rather than a toggle at the top of one long form. The two
 * reports ask for genuinely different things — one has a name and an age, the
 * other has neither — and a form that reshaped itself around a radio button
 * would be a form where half the fields appear and disappear as somebody works
 * through it.
 *
 * It also gives the unconfirmed-email warning somewhere to live *before* anyone
 * has typed anything. Discovering that requirement after filling in twenty
 * fields about a missing relative would be indefensible.
 */
export default async function ReportChooserPage() {
  const user = await requireUser();

  return (
    <div className="container-page max-w-3xl py-10 sm:py-14">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          File a report
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-muted">
          Which of these describes your situation? Both go to the same reviewers.
        </p>
      </header>

      {!user.isEmailVerified ? (
        <div className="mt-6">
          <Callout tone="warning" title="Confirm your email address first">
            <p>
              We sent a link to <span className="font-medium text-ink">{user.email}</span>. You need
              to confirm it before a report can be filed — it is what stops the review queue being
              flooded with fabricated cases.
            </p>
            <p className="mt-2">
              <Link href="/dashboard" className="font-medium">
                Resend the confirmation link
              </Link>
            </p>
          </Callout>
        </div>
      ) : null}

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <Card className="flex flex-col p-6">
          <div className="flex size-11 items-center justify-center rounded-xl bg-missing-soft text-missing-fg">
            <UserSearch aria-hidden className="size-5" />
          </div>
          <h2 className="mt-5 font-display text-xl font-semibold text-ink">
            Someone is missing
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            You know who they are and they cannot be found. You will be asked for their name, age,
            where they were last seen, and a way for a reviewer to reach you.
          </p>
          <div className="mt-auto pt-6">
            <ButtonLink href="/report/missing" className="w-full">
              Start this report
              <ArrowRight aria-hidden className="size-4" />
            </ButtonLink>
          </div>
        </Card>

        <Card className="flex flex-col p-6">
          <div className="flex size-11 items-center justify-center rounded-xl bg-found-soft text-found-fg">
            <UserCheck aria-hidden className="size-5" />
          </div>
          <h2 className="mt-5 font-display text-xl font-semibold text-ink">
            You have found someone
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            You have found a person who cannot say who they are or where they belong. You will be
            asked for a description and an age range rather than a name.
          </p>
          <div className="mt-auto pt-6">
            <ButtonLink href="/report/found" variant="secondary" className="w-full">
              Start this report
              <ArrowRight aria-hidden className="size-4" />
            </ButtonLink>
          </div>
        </Card>
      </div>

      <Callout tone="warning" className="mt-8" title="If this is an emergency, call the police">
        Locora is a register, not a response service. Nobody is dispatched from here, and a reviewer
        may take hours to see a new report. Contact your local police first — then file here so
        anybody who might recognise them can.
      </Callout>
    </div>
  );
}
