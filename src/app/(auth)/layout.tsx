import Link from "next/link";

import { LocoraWordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/providers/theme";

/**
 * The shell around every credential screen.
 *
 * ## Two columns, and why the second one is not decoration
 *
 * On a wide screen the form sits on the left and a quiet panel on the right
 * says what Locora does with what you are about to give it. That panel is the
 * answer to the question somebody actually has at a sign-up form on a
 * missing-person platform — "who sees this?" — at the moment they are asking
 * it, rather than on a policy page they will not open.
 *
 * On anything narrower it is dropped entirely rather than stacked below the
 * form. Reassurance placed under a submit button is reassurance nobody reads,
 * and on a phone the form should be the whole screen.
 *
 * ## Why it does not scroll
 *
 * `min-h-dvh` with the form vertically centred, and every auth form kept short
 * enough to fit a 1280×720 window. `dvh` rather than `vh` because on mobile
 * Safari `100vh` is taller than the visible area, which puts the submit button
 * under the browser's own toolbar — on the one screen where the button is the
 * entire purpose of the page.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="container-page flex h-16 shrink-0 items-center justify-between">
        <Link href="/" aria-label="Locora — home">
          <LocoraWordmark size="sm" />
        </Link>
        <ThemeToggle />
      </header>

      <main id="main" className="container-page flex flex-1 items-center py-8">
        <div className="mx-auto grid w-full max-w-5xl items-center gap-16 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <div className="mx-auto w-full max-w-narrow lg:mx-0">{children}</div>

          {/* Presentational, and hidden from assistive technology below lg the
              same way it is hidden visually — there is no value in a screen
              reader announcing a panel that sighted users at that width do not
              get either. */}
          <aside className="hidden lg:block">
            <ReassurancePanel />
          </aside>
        </div>
      </main>

      <footer className="container-page shrink-0 py-6">
        <p className="text-xs text-ink-subtle">
          Locora is not an emergency service. If someone is in immediate danger, contact your local
          emergency number first.
        </p>
      </footer>
    </div>
  );
}

const POINTS = [
  {
    title: "Your contact details stay yours",
    body: "The phone number on a report is shown to you and to Locora's reviewers. Strangers browsing a case never receive it — the server does not send it.",
  },
  {
    title: "A person reads every report",
    body: "Nothing you file goes public automatically. A reviewer publishes it, asks for more, or declines with a reason you can read.",
  },
  {
    title: "You are told when anything changes",
    body: "Status changes and possible matches arrive as notifications. Locora does not email you about anything else.",
  },
];

function ReassurancePanel() {
  return (
    <div className="border-l border-line pl-10">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
        What happens to what you tell us
      </h2>

      <dl className="mt-7 space-y-6">
        {POINTS.map((point) => (
          <div key={point.title}>
            <dt className="text-base font-semibold text-ink">{point.title}</dt>
            <dd className="mt-1 max-w-md text-sm leading-relaxed text-ink-muted">{point.body}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-8 text-sm text-ink-muted">
        <Link
          href="/safety"
          className="font-medium text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
        >
          Read the full detail
        </Link>
      </p>
    </div>
  );
}
