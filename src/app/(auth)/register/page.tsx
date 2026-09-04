import type { Metadata } from "next";
import Link from "next/link";

import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create a Locora account to file and follow reports.",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Create an account</h1>
      <p className="mt-2 text-base text-ink-muted">
        You need an account to file a report, so that we can tell you when something changes.
      </p>

      <div className="mt-8">
        <RegisterForm />
      </div>

      <p className="mt-8 text-sm text-ink-muted">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
