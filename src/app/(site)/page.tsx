import {
  ArrowRight,
  BellRing,
  ClipboardList,
  Clock,
  EyeOff,
  Link2,
  Lock,
  MailCheck,
  Search,
  ShieldCheck,
  Siren,
  UserCheck,
  UserSearch,
} from "lucide-react";
import Link from "next/link";

import { CaseCard } from "@/components/cases/case-card";
import { HeroPortraits } from "@/components/site/hero-portraits";
import { DemoSection } from "@/components/demo/demo-section";
import { TOTAL_DURATION_MS, formatTimecode } from "@/components/demo/script";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Reveal } from "@/components/ui/reveal";
import { getCurrentUser } from "@/server/auth/current-user";
import { listFoundFeed, listMissingFeed } from "@/server/reports/queries";

/**
 * The landing page.
 *
 * ## No invented numbers
 *
 * There are no statistics, testimonials, partner logos or trust badges here.
 * Locora has none that are real, and manufacturing "8,400 families reunited"
 * for a service about missing people would be the worst thing this interface
 * could do — it is the exact claim a desperate visitor would rely on.
 *
 * The one number shown is the live count of published cases, read from the
 * database, and it is only rendered when it is greater than zero. On a fresh
 * deployment the section is simply absent rather than announcing "0 cases".
 *
 * ## Why the feed is on the landing page
 *
 * Because it is the product. A missing-person platform whose home page is
 * marketing copy with the cases two clicks away has the priority backwards: the
 * single most valuable thing that can happen here is a stranger scrolling past
 * a face they recognise.
 */

// Read at request time, not cached: a case that has just been published should
// appear, and a case that has just been resolved should stop appearing. Caching
// this for even a minute would mean showing a resolved case to strangers.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const viewer = await getCurrentUser();

  // Both feeds in parallel — they are independent, and awaiting them in
  // sequence would double this page's time to first byte.
  const [missing, found] = await Promise.all([
    listMissingFeed({}, { offset: 0, limit: 4 }, viewer),
    listFoundFeed({}, { offset: 0, limit: 4 }, viewer),
  ]);

  const totalPublished = missing.total + found.total;
  const recent = [...missing.items, ...found.items]
    // Interleaved by recency so the strip is not four missing cases followed by
    // four found ones, which would read as two separate lists.
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 4);

  return (
    <>
      <Hero totalPublished={totalPublished} />
      <BeforeYouStart />
      <TwoWays />
      <HowItWorks />
      <WatchTheWalkthrough />
      <AfterYouFile />
      <RecentCases cases={recent} total={totalPublished} />
      <TrustSection />
      <ClosingCta signedIn={viewer !== null} />
    </>
  );
}

// ---------------------------------------------------------------------------

function Hero({ totalPublished }: { totalPublished: number }) {
  return (
    <section className="relative overflow-hidden border-b border-line">
      {/*
        A faint dot grid rather than a gradient wash.
        Gradients are the default decoration of every generated landing page; a
        printed-register texture is quieter and suits a product that is closer
        to a public record than to a consumer app. Pointer-events-none so it
        cannot intercept a click, and aria-hidden because it means nothing.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.4] dark:opacity-[0.25]"
        style={{
          backgroundImage: "radial-gradient(circle, var(--line-strong) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black 20%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black 20%, transparent 75%)",
        }}
      />

      {/*
        Two columns from lg up.

        The hero was a single left-aligned block in a 78rem container, so on a
        desktop roughly a third of it was empty — which reads less as restraint
        than as a column somebody forgot to fill. What fills it is not
        decoration: it is the emergency guidance, which until now appeared only
        in the footer and two thirds of the way down a very long page. On a
        product somebody may open in the middle of the worst hour of their life,
        "we are not the emergency services, call them first" is not a footnote.
      */}
      <div className="container-page relative py-16 sm:py-24 lg:py-28">
        <div className="grid items-start gap-x-12 gap-y-10 lg:grid-cols-12">
        <div className="max-w-3xl lg:col-span-7">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-muted">
              <ShieldCheck aria-hidden className="size-3.5 text-primary" />
              Every report is reviewed by a person
            </p>
          </Reveal>

          <Reveal delayMs={60}>
            <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Find what matters.
            </h1>
          </Reveal>

          <Reveal delayMs={120}>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-muted">
              Locora is where families report a missing person, where someone who has found an
              unidentified person can say so, and where the two are carefully brought together.
              Reports are checked before they go public, and contact details are never shown to
              strangers.
            </p>
          </Reveal>

          <Reveal delayMs={180}>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/report/missing" size="lg">
                Report a missing person
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              <ButtonLink href="/report/found" size="lg" variant="secondary">
                I have found someone
              </ButtonLink>
            </div>
          </Reveal>

          {/* Rendered only when it is a real, non-zero figure. */}
          {totalPublished > 0 ? (
            <Reveal delayMs={240}>
              <p className="mt-8 text-sm text-ink-muted">
                <Link
                  href="/cases"
                  className="font-medium text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
                >
                  {totalPublished} {totalPublished === 1 ? "case is" : "cases are"} published right now
                </Link>{" "}
                — you might recognise one of them.
              </p>
            </Reveal>
          ) : null}
        </div>

        {/*
          The span belongs on `Reveal`, which is the direct grid child. On the
          element inside it, it does nothing: that element is not a grid item,
          so the wrapper falls back to a single track and the panel renders one
          word wide.

          Hidden below `lg`, where the hero is a single column and an
          illustration would only push the two report buttons further down the
          screen for somebody who came here to use one.
        */}
        <Reveal delayMs={220} className="hidden lg:col-span-5 lg:block">
          <HeroPortraits className="mx-auto max-w-md" />
        </Reveal>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

/**
 * The two things somebody should know before they begin.
 *
 * A band of its own directly under the hero, rather than a panel inside it.
 * Inside the hero it competed with the two report buttons for the same glance,
 * and it was the reason the hero had no room for anything else. Out here it is
 * still the first thing after the fold, which is the part that mattered: the
 * emergency line used to sit only in the footer, and on a service somebody may
 * reach in the worst hour of their life, "call the emergency services first" is
 * not a footnote.
 *
 * Quiet on purpose. It is a notice, not a warning — a red banner across the top
 * of a page about a missing relative would raise an alarm in somebody who is
 * already alarmed, and would be ignored by the third visit.
 */
function BeforeYouStart() {
  return (
    <section className="border-b border-line bg-surface" aria-labelledby="before-you-start">
      <div className="container-page py-6 sm:py-7">
        <h2 id="before-you-start" className="sr-only">
          Before you start
        </h2>

        <div className="grid gap-5 sm:grid-cols-2 sm:gap-8">
          <div className="flex gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-critical-soft text-critical-fg">
              <Siren aria-hidden className="size-4" />
            </span>
            <p className="text-sm leading-relaxed text-ink-muted">
              <span className="font-medium text-ink">Locora is not an emergency service.</span>{" "}
              If someone is in immediate danger, contact your local emergency number and the police
              first — then file here, so anybody who might recognise them can.
            </p>
          </div>

          <div className="flex gap-3 border-t border-line pt-5 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Clock aria-hidden className="size-4" />
            </span>
            <p className="text-sm leading-relaxed text-ink-muted">
              <span className="font-medium text-ink">Nothing is published instantly.</span>{" "}
              A person reads every report before it appears, and how long that takes depends on how
              many reviewers are active.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function TwoWays() {
  return (
    <section className="container-page py-14 sm:py-20" aria-labelledby="two-ways-heading">
      <Reveal>
        <div className="max-w-2xl">
          <h2
            id="two-ways-heading"
            className="font-display text-3xl font-bold tracking-tight text-ink"
          >
            Two ways to help
          </h2>
          <p className="mt-3 text-base leading-relaxed text-ink-muted">
            Locora holds two kinds of report. They are filed independently, by different people who
            have never met, and a reviewer is what connects them.
          </p>
        </div>
      </Reveal>

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        <Reveal delayMs={60}>
          <PathCard
            tone="missing"
            icon={<UserSearch aria-hidden className="size-5" />}
            title="Someone is missing"
            description="File a report with their details, where they were last seen, and a photograph. Once a reviewer publishes it, anyone can see it — but only you and Locora's reviewers ever see your contact details."
            points={[
              "Takes about five minutes",
              "Up to five photographs",
              "You are told the moment anything changes",
            ]}
            href="/report/missing"
            cta="Report a missing person"
          />
        </Reveal>

        <Reveal delayMs={120}>
          <PathCard
            tone="found"
            icon={<UserCheck aria-hidden className="size-5" />}
            title="You have found someone"
            description="If you have found a person who cannot say who they are or where they belong, record what you know. A photograph is optional here on purpose — sometimes publishing one is not the safe choice."
            points={[
              "An age range, not a guess at an exact age",
              "Where they are now stays private",
              "Photographs are optional",
            ]}
            href="/report/found"
            cta="Report someone found"
          />
        </Reveal>
      </div>
    </section>
  );
}

function PathCard({
  tone,
  icon,
  title,
  description,
  points,
  href,
  cta,
}: {
  tone: "missing" | "found";
  icon: React.ReactNode;
  title: string;
  description: string;
  points: string[];
  href: string;
  cta: string;
}) {
  return (
    <Card className="flex h-full flex-col p-6 sm:p-7">
      <div
        className={
          tone === "missing"
            ? "flex size-11 items-center justify-center rounded-xl bg-missing-soft text-missing-fg"
            : "flex size-11 items-center justify-center rounded-xl bg-found-soft text-found-fg"
        }
      >
        {icon}
      </div>

      <h3 className="mt-5 font-display text-xl font-semibold text-ink">{title}</h3>
      <p className="mt-2.5 text-base leading-relaxed text-ink-muted">{description}</p>

      <ul className="mt-5 space-y-2">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2.5 text-sm text-ink-muted">
            <span
              aria-hidden
              className={
                tone === "missing"
                  ? "mt-1.5 size-1.5 shrink-0 rounded-full bg-missing"
                  : "mt-1.5 size-1.5 shrink-0 rounded-full bg-found"
              }
            />
            {point}
          </li>
        ))}
      </ul>

      {/* mt-auto pins the action to the bottom, so two cards of unequal text
          length still line their buttons up. */}
      <div className="mt-auto pt-7">
        <ButtonLink href={href} variant="secondary">
          {cta}
          <ArrowRight aria-hidden className="size-4" />
        </ButtonLink>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

const STEPS = [
  {
    Icon: ClipboardList,
    title: "Report",
    body: "You file what you know. Nothing is published yet — the report goes into a queue, not straight onto the site.",
  },
  {
    Icon: Search,
    title: "Review",
    body: "A reviewer checks the details and publishes, asks for more, or declines with a reason you can read.",
  },
  {
    Icon: Link2,
    title: "Match",
    body: "Reviewers compare missing and found reports and link the ones that may describe the same person. Both families are told it is only a possibility.",
  },
  {
    Icon: UserCheck,
    title: "Reunite",
    body: "When a link is confirmed, the case is closed and comes off the public feed. Nothing is decided automatically.",
  },
];

function HowItWorks() {
  return (
    <section
      className="border-y border-line bg-surface py-14 sm:py-20"
      aria-labelledby="how-it-works-heading"
    >
      <div className="container-page">
        <Reveal>
          <div className="max-w-2xl">
            <h2
              id="how-it-works-heading"
              className="font-display text-3xl font-bold tracking-tight text-ink"
            >
              How Locora works
            </h2>
            <p className="mt-3 text-base leading-relaxed text-ink-muted">
              Four steps, with a person involved at every one that matters.
            </p>
          </div>
        </Reveal>

        {/* An ordered list, because the steps have an order and a screen reader
            should say "1 of 4" rather than reading four unrelated headings. */}
        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <Reveal delayMs={index * 60}>
                <div className="flex h-full flex-col">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <step.Icon aria-hidden className="size-4.5" />
                    </span>
                    <span
                      className="font-display text-2xl font-bold text-line-strong"
                      aria-hidden
                      data-numeric
                    >
                      {index + 1}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold text-ink">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{step.body}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

/**
 * The walkthrough.
 *
 * Placed after "how it works" rather than in the hero, deliberately. Somebody
 * arriving in an emergency should reach the two report buttons without being
 * asked to watch anything first; somebody who is evaluating the product has by
 * this point read what it claims and is in a position to want to see it.
 */
function WatchTheWalkthrough() {
  return (
    <section className="container-page py-14 sm:py-20" aria-labelledby="walkthrough-heading">
      <Reveal>
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="walkthrough-heading"
            className="font-display text-3xl font-bold tracking-tight text-ink"
          >
            See it work, end to end
          </h2>
          <p className="mt-3 text-base leading-relaxed text-ink-muted">
            One fictional case, from the moment it is filed to the moment it closes. It runs for{" "}
            {/* Read from the script rather than written out. The prose here said
                "under two minutes" while the walkthrough ran to 2:05, which is
                the sort of small untruth that appears the moment a duration is
                stated in two places. */}
            {formatTimecode(TOTAL_DURATION_MS)}, is narrated and captioned, and you can skip to
            any chapter or mute it.
          </p>
        </div>
      </Reveal>

      <Reveal delayMs={80}>
        <div className="mt-10">
          <DemoSection />
        </div>
      </Reveal>
    </section>
  );
}

const AFTER_FILING = [
  {
    Icon: ClipboardList,
    title: "It goes into a queue, not onto the site",
    body: "Nothing you file is published automatically. It waits for a person to read it — which is what stops this becoming a noticeboard anybody can post anything to.",
  },
  {
    Icon: MailCheck,
    title: "You are told what was decided, and why",
    body: "Published, or declined with a written reason you can read in full. A decline is not a dead end: you can correct what was wrong and file again.",
  },
  {
    Icon: BellRing,
    title: "You hear from us when it matters, and not otherwise",
    body: "A status change, and a possible match. That is the entire list. Locora does not send anything else, because a notification you learn to ignore is one you will miss when it counts.",
  },
  {
    Icon: Lock,
    title: "Your contact details stay yours throughout",
    body: "The phone number on your report reaches Locora's reviewers and nobody else. Strangers reading your case never receive it — the server does not send it to them.",
  },
];

/**
 * What happens after somebody presses submit.
 *
 * This section exists because it is the question a person actually has at the
 * moment of filing, and because leaving it unanswered is what makes a register
 * feel like a form that goes nowhere. It also sets an honest expectation about
 * timing, which a product in this position is tempted to avoid.
 */
function AfterYouFile() {
  return (
    <section className="border-y border-line bg-surface py-14 sm:py-20" aria-labelledby="after-heading">
      <div className="container-page">
        <Reveal>
          <div className="max-w-2xl">
            <h2
              id="after-heading"
              className="font-display text-3xl font-bold tracking-tight text-ink"
            >
              What happens after you file
            </h2>
            <p className="mt-3 text-base leading-relaxed text-ink-muted">
              The part most services leave vague. Here is the whole of it.
            </p>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {AFTER_FILING.map((item, index) => (
            <Reveal key={item.title} delayMs={index * 60}>
              <div className="flex gap-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <item.Icon aria-hidden className="size-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-display text-base font-semibold text-ink">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{item.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delayMs={260}>
          <p className="mt-10 max-w-2xl rounded-lg border border-line bg-canvas px-4 py-3 text-sm leading-relaxed text-ink-muted">
            {/* The hero now carries both of these facts. Restating them
                verbatim two thirds of the way down would read as an editing
                slip; the reinforcement is worth keeping, so this says the part
                the hero does not — that filing here is an addition to calling
                the police, not an alternative to it. */}
            <span className="font-medium text-ink">Locora is not an emergency service.</span>{" "}
            If somebody is in immediate danger, contact your local emergency number and the police
            first. Filing here is something to do as well, not instead — and it is worth doing even
            once they are involved, because a stranger who recognises a face is not someone the
            police can reach.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function RecentCases({
  cases,
  total,
}: {
  cases: (Awaited<ReturnType<typeof listMissingFeed>>["items"][number] | Awaited<ReturnType<typeof listFoundFeed>>["items"][number])[];
  total: number;
}) {
  return (
    <section className="container-page py-14 sm:py-20" aria-labelledby="recent-heading">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h2 id="recent-heading" className="font-display text-3xl font-bold tracking-tight text-ink">
              Cases open now
            </h2>
            <p className="mt-3 text-base leading-relaxed text-ink-muted">
              Take a moment to look. Recognising one face is the whole reason this exists.
            </p>
          </div>
          {total > 0 ? (
            <ButtonLink href="/cases" variant="secondary">
              Browse all {total}
              <ArrowRight aria-hidden className="size-4" />
            </ButtonLink>
          ) : null}
        </div>
      </Reveal>

      <div className="mt-10">
        {cases.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cases.map((report, index) => (
              <Reveal key={`${report.kind}-${report.id}`} delayMs={index * 50}>
                {/* The first two are above the fold on most screens, so their
                    photographs are fetched eagerly rather than lazily. */}
                <CaseCard report={report} priority={index < 2} />
              </Reveal>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<UserSearch aria-hidden className="size-5" />}
            title="No published cases yet"
            description="Nothing has been published on this Locora instance so far. When a report is reviewed and published, it will appear here."
            action={
              <ButtonLink href="/report/missing" variant="secondary">
                File the first report
              </ButtonLink>
            }
          />
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

const TRUST_POINTS = [
  {
    Icon: EyeOff,
    title: "Contact details are never public",
    body: "A phone number or email on a report is visible to you and to Locora's reviewers, and to nobody else. The server withholds them — it is not a matter of the page choosing not to display them.",
  },
  {
    Icon: ShieldCheck,
    title: "A person reviews every report",
    body: "Nothing reaches the public feed automatically, and no match is ever confirmed by software. A wrong match on a missing-person case is not a bad recommendation; it is a family being told something untrue.",
  },
  {
    Icon: Lock,
    title: "Resolved cases come down",
    body: "Once a case is closed, it leaves the public feed and its photographs are removed. Continuing to show someone's face after they have been found serves nobody.",
  },
];

function TrustSection() {
  return (
    <section className="border-y border-line bg-surface py-14 sm:py-20" aria-labelledby="trust-heading">
      <div className="container-page">
        <Reveal>
          <div className="max-w-2xl">
            <h2 id="trust-heading" className="font-display text-3xl font-bold tracking-tight text-ink">
              Why you can trust this with a case
            </h2>
            <p className="mt-3 text-base leading-relaxed text-ink-muted">
              Locora holds some of the most sensitive information a person can hand over. These are
              the rules the software actually enforces, not a statement of intent.
            </p>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {TRUST_POINTS.map((point, index) => (
            <Reveal key={point.title} delayMs={index * 60}>
              <div className="flex h-full flex-col rounded-xl border border-line bg-canvas p-6">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <point.Icon aria-hidden className="size-4.5" />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold text-ink">{point.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{point.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delayMs={200}>
          <p className="mt-8 text-sm text-ink-muted">
            <Link
              href="/safety"
              className="font-medium text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
            >
              Read how Locora handles your information
            </Link>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function ClosingCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="container-page py-14 sm:py-20">
      <Reveal>
        <div className="overflow-hidden rounded-2xl border border-line bg-primary px-6 py-12 text-center sm:px-12">
          <h2 className="font-display text-3xl font-bold tracking-tight text-primary-fg">
            Someone is looking for them.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-primary-fg/80">
            Whether you are searching for a person or have found one, the sooner it is recorded, the
            sooner the two can meet.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink
              href={signedIn ? "/report" : "/register"}
              size="lg"
              // Inverted against the navy panel: the primary button's own navy
              // would be invisible here.
              className="bg-surface text-primary hover:bg-surface-hover"
            >
              {signedIn ? "File a report" : "Create an account"}
              <ArrowRight aria-hidden className="size-4" />
            </ButtonLink>
            <ButtonLink
              href="/cases"
              size="lg"
              variant="secondary"
              className="border-primary-fg/25 bg-transparent text-primary-fg hover:bg-primary-fg/10"
            >
              Browse open cases
            </ButtonLink>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
