import type { Metadata } from "next";
import Link from "next/link";

import { Callout } from "@/components/ui/feedback";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

/**
 * The page a reset link lands on.
 *
 * The token arrives as a query parameter rather than a path segment, so that a
 * malformed or missing one produces this page with a clear explanation instead
 * of a 404 that leaves somebody wondering whether the link was ever valid.
 *
 * The token is not validated here. It cannot be — only the server holds the
 * hash to compare against — so it is passed to the form and checked when the
 * new password is submitted. Attempting a "is this token valid?" probe on load
 * would also burn the token, since claiming it is what proves it was unused.
 */
export default async function ResetPasswordPage({
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
          <Callout tone="warning" title="No reset token">
            The link you followed is missing its token. Some email clients break long links across
            two lines — try copying the whole thing into your browser, or request a new one.
          </Callout>
        </div>
        <p className="mt-6 text-sm text-ink-muted">
          <Link
            href="/forgot-password"
            className="font-medium text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
          >
            Request a new reset link
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
        Choose a new password
      </h1>
      <p className="mt-2 text-base text-ink-muted">
        Setting a new password signs you out of Locora everywhere else.
      </p>

      <div className="mt-8">
        <ResetPasswordForm token={token} />
      </div>
    </div>
  );
}
