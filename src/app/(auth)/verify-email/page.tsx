import type { Metadata } from "next";
import Link from "next/link";

import { Callout } from "@/components/ui/feedback";

import { VerifyEmailClient } from "./verify-email-client";

export const metadata: Metadata = {
  title: "Confirm your email",
  robots: { index: false, follow: false },
};

/**
 * The page an email-confirmation link lands on.
 *
 * ## Why a click, and not automatic on load
 *
 * The token is claimed by a POST that the visitor triggers, not by the page
 * render. Confirming on load looks smoother and breaks: mail clients and
 * corporate security appliances routinely prefetch links to scan them, which
 * would consume the token before the recipient ever opened it — and they would
 * then arrive at "this link is no longer valid" for a link they had not used.
 *
 * A GET that changes state is also simply the wrong shape, for exactly this
 * reason.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
          This link is incomplete
        </h1>
        <div className="mt-6">
          <Callout tone="warning" title="No confirmation token">
            The link is missing its token. Some email clients split long links across two lines —
            try copying the whole thing into your browser.
          </Callout>
        </div>
        <p className="mt-6 text-sm text-ink-muted">
          Signed in already?{" "}
          <Link
            href="/dashboard"
            className="font-medium text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
          >
            Request a new link from your dashboard
          </Link>
        </p>
      </div>
    );
  }

  return <VerifyEmailClient token={token} />;
}
