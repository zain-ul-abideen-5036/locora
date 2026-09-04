import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Locora account to manage your reports.",
  // A credential page has nothing to offer a search engine, and indexing it
  // only creates a plausible-looking result for a phishing page to imitate.
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Sign in</h1>
      <p className="mt-2 text-base text-ink-muted">
        Manage your reports and see updates on your cases.
      </p>

      <div className="mt-8">
        <LoginForm />
      </div>

      <p className="mt-8 text-sm text-ink-muted">
        New to Locora?{" "}
        <Link
          href="/register"
          className="font-medium text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
