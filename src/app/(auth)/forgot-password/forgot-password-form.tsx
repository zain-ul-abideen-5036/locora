"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Callout } from "@/components/ui/feedback";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { forgotPasswordSchema } from "@/lib/validation/auth";

/**
 * Requesting a password reset.
 *
 * ## The confirmation is deliberately non-committal
 *
 * "If that address has a Locora account, a reset link is on its way." It does
 * not say whether one was sent, because saying so would turn this form into an
 * account-enumeration tool — type an address, read the response, learn whether
 * that person has a Locora account. On a platform holding missing-person cases
 * that fact is itself sensitive.
 *
 * The wording is chosen to be honest rather than evasive: it tells the visitor
 * exactly what to expect and why nothing more specific is being said, instead
 * of a cheerful "check your inbox!" that may be false.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldError(null);

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/api/auth/forgot-password", { method: "POST", body: parsed.data });
      setSent(true);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <Callout tone="success" title="Check your email">
          If <span className="font-medium text-ink">{email}</span> has a Locora account, a reset
          link is on its way. It can be used once, and expires in an hour.
        </Callout>
        <p className="text-xs leading-relaxed text-ink-subtle">
          We do not confirm whether an address is registered — that would let anyone check who has
          an account here.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError ? <Callout tone="danger" title="Could not send the link">{formError}</Callout> : null}

      <Field label="Email address" error={fieldError} required>
        {(props) => (
          <Input
            {...props}
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            spellCheck={false}
          />
        )}
      </Field>

      <Button
        type="submit"
        size="lg"
        loading={submitting}
        loadingLabel="Sending the link"
        className="w-full"
      >
        Send reset link
      </Button>
    </form>
  );
}
