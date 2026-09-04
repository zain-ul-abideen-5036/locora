import { ClipboardList, Link2, Search, UserCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";

export const metadata: Metadata = {
  title: "How Locora works",
  description:
    "What happens to a report on Locora: how it is reviewed, how missing and found reports are matched, and who decides.",
};

/**
 * How the product works, written for somebody deciding whether to trust it.
 *
 * Every claim here is checkable against the code, and several are deliberately
 * unflattering — that a reviewer may take hours, that Locora cannot search for
 * anybody, that a match is only a possibility. A page about a missing-person
 * service that promised more than it does would be the most damaging thing on
 * the site.
 */

const STAGES = [
  {
    Icon: ClipboardList,
    title: "You file a report",
    body: [
      "You need an account and a confirmed email address. That is not bureaucracy: an unconfirmed address costs nothing to create, and without the requirement one script could fill the review queue with fabricated cases faster than a person could clear them.",
      "Nothing you file is published at this point. It goes into a queue.",
    ],
  },
  {
    Icon: Search,
    title: "A person reviews it",
    body: [
      "A Locora reviewer reads the report and decides whether to publish it. They may publish it, mark it as being checked, or decline it — and declining requires them to write a reason, which you are shown in full.",
      "How long this takes depends on how many reviewers are active and how many reports are waiting. It is not instant, and Locora will not pretend otherwise.",
    ],
  },
  {
    Icon: Link2,
    title: "Reviewers look for matches",
    body: [
      "Missing-person reports and found-person reports are filed independently, by people who have never met. Locora ranks found-person reports against a missing case by things that can be checked — whether the age ranges overlap, whether the city is the same, whether the timing is possible — and shows a reviewer why each one appeared.",
      "That ranking is a shortlist, not a verdict. A reviewer reads both cases in full before linking anything, and a link is recorded as a possibility that has not been confirmed.",
    ],
  },
  {
    Icon: UserCheck,
    title: "A match is confirmed, or ruled out",
    body: [
      "When a link is made, both reporters are told immediately that there is a possible match and that it is unconfirmed. If a reviewer then establishes it is the same person, both cases are closed and taken off the public feed. If it is not, both go back on the feed and both reporters are told it was ruled out.",
      "No software confirms a match. A false match here is not a bad recommendation — it is a family being told something untrue about a missing relative — so a person makes that call, every time.",
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <div className="container-page max-w-3xl py-12 sm:py-16">
      <header>
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink">
          How Locora works
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-muted">
          Locora is a register of two kinds of report, and a careful process for connecting them.
          This page describes what actually happens, including the parts that are slower or more
          limited than you might hope.
        </p>
      </header>

      <div className="mt-12 space-y-12">
        {STAGES.map((stage, index) => (
          <section key={stage.title} className="flex gap-5">
            <div className="flex flex-col items-center">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <stage.Icon aria-hidden className="size-4.5" />
              </span>
              {/* A connector line, so the four stages read as one sequence
                  rather than four unrelated blocks. Dropped after the last. */}
              {index < STAGES.length - 1 ? (
                <span aria-hidden className="mt-2 w-px flex-1 bg-line" />
              ) : null}
            </div>

            <div className="min-w-0 pb-2">
              <h2 className="font-display text-xl font-semibold text-ink">{stage.title}</h2>
              {stage.body.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-base leading-relaxed text-ink-muted">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-14 space-y-5">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
          What Locora is not
        </h2>

        <Callout tone="warning" title="It is not an emergency service">
          Nobody is dispatched from here. If a person is in immediate danger, or has just gone
          missing, contact your local emergency number and the police first — then file here, so
          that anyone who might recognise them can.
        </Callout>

        <Callout tone="info" title="It does not search for anybody">
          Locora holds reports and connects them. It does not have investigators, access to any
          official database, or any way to look for a person in the world. Its value is that a
          stranger might recognise a face on the public feed, and that two reports filed by
          unconnected people can be brought together.
        </Callout>

        <Callout tone="info" title="It does not identify people from photographs">
          There is no facial recognition. The database is built so that automated matching could be
          added later — a match record can carry a source and a confidence score — but nothing
          writes those today, and any such system would still produce a possibility for a person to
          check rather than a decision.
        </Callout>
      </div>

      <div className="mt-14 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <h2 className="font-display text-xl font-semibold text-ink">Ready to file a report?</h2>
        <p className="mt-2 text-base leading-relaxed text-ink-muted">
          Both kinds of report take about five minutes. You can also read{" "}
          <Link
            href="/safety"
            className="font-medium text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
          >
            how Locora handles your information
          </Link>{" "}
          first.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <ButtonLink href="/report/missing">Report a missing person</ButtonLink>
          <ButtonLink href="/report/found" variant="secondary">
            Report someone found
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
