"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Callout } from "@/components/ui/feedback";
import { PasswordInput } from "@/components/ui/password-input";
import { apiFetch, ApiError, errorMessage } from "@/lib/api-client";
import { loginSchema } from "@/lib/validation/auth";

/**
 * The sign-in form.
 *
 * ## Where the redirect goes afterwards
 *
 * `?next=` is honoured, but only after being checked. `safeNext` rejects
 * anything that is not a plain path on this origin. Without that check the
 * parameter is an open redirect: a link to
 * `locora.app/login?next=https://evil.example` would show a genuine Locora
 * sign-in form and then hand the freshly-authenticated visitor to somebody
 * else's page — a phishing flow that borrows this product's credibility and its
 * real domain.
 *
 * ## A hard navigation, not a router push
 *
 * `window.location.assign` after a successful sign-in. Signing in changes what
 * the server renders for every route — the header, the account menu, the
 * dashboard — and a client-side push would keep serving the RSC payloads cached
 * for the anonymous visitor this browser was a moment ago.
 */

/** Only ever a same-origin path. Anything else falls back to the dashboard. */
function safeNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  // Must begin with exactly one slash: "//evil.example" is protocol-relative
  // and leaves the site, and "https://…" obviously does.
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  // A backslash is normalised to a slash by some browsers, which turns
  // "/\evil.example" into a protocol-relative URL.
  if (raw.includes("\\")) return "/dashboard";
  return raw;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const justReset = searchParams.get("reset") === "1";
  const justVerified = searchParams.get("verified") === "1";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    // Validated client-side first purely to save a round trip on an obvious
    // mistake. The server runs the same schema and is the only check that counts.
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.map(String).join(".");
        errors[key] ??= issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/api/auth/login", { method: "POST", body: parsed.data });
      router.refresh();
      // A full document load, deliberately. Signing in changes what the server
      // renders for every route, and router.push() would keep serving the RSC
      // payloads cached moments ago for an anonymous visitor — including a
      // header with a "Sign in" button.
      window.location.assign(safeNext(searchParams.get("next")));
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        setFieldErrors(error.fieldErrors());
      }
      setFormError(errorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {justReset ? (
        <Callout tone="success" title="Password changed">
          Sign in with your new password.
        </Callout>
      ) : null}

      {justVerified ? (
        <Callout tone="success" title="Email confirmed">
          Your address is confirmed. You can file reports now.
        </Callout>
      ) : null}

      {formError ? <Callout tone="danger" title="Could not sign in">{formError}</Callout> : null}

      <Field label="Email address" error={fieldErrors.email} required>
        {(props) => (
          <Input
            {...props}
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            // Focused on load: this page has one purpose and the visitor
            // arrived intending to type.
            autoFocus
            placeholder="you@example.com"
            spellCheck={false}
          />
        )}
      </Field>

      <Field
        label="Password"
        error={fieldErrors.password}
        required
        labelAction={
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
          >
            Forgot your password?
          </Link>
        }
      >
        {(props) => (
          <PasswordInput
            {...props}
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Your password"
          />
        )}
      </Field>

      <Button type="submit" size="lg" loading={submitting} loadingLabel="Signing in" className="w-full">
        Sign in
      </Button>
    </form>
  );
}
