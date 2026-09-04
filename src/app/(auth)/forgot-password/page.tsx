import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
        Reset your password
      </h1>
      <p className="mt-2 text-base text-ink-muted">
        Tell us the address on your account and we will send you a link to choose a new password.
      </p>

      <div className="mt-8">
        <ForgotPasswordForm />
      </div>

      <p className="mt-8 text-sm text-ink-muted">
        <Link
          href="/login"
          className="font-medium text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
