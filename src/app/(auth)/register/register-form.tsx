"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Callout } from "@/components/ui/feedback";
import { PasswordInput } from "@/components/ui/password-input";
import { apiFetch, ApiError, errorMessage } from "@/lib/api-client";
import { registerSchema } from "@/lib/validation/auth";

/**
 * Registration.
 *
 * ## Only four fields
 *
 * Name, email, password. Nothing else is asked for, because everything else can
 * be asked for later by a form that actually needs it — and every extra field
 * here is another thing between somebody in distress and being able to file.
 * The name is optional: it is used to sign notifications and to show reviewers
 * who filed a report, neither of which is worth blocking an account over.
 *
 * ## Why the success state is a message and not a redirect
 *
 * The account is created and signed in immediately, but the visitor is told
 * plainly that a confirmation email is on its way and that they need it before
 * filing. Dropping them on a dashboard with an unexplained banner would leave
 * them to discover the requirement when a report is refused.
 *
 * If the email could not be handed off, that is said too. Claiming "check your
 * inbox" for a message that was never sent is the kind of small lie that costs
 * a user twenty minutes of waiting.
 */
export function RegisterForm() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<{ emailSent: boolean } | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = registerSchema.safeParse({ email, password, fullName, phone: null });
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
      const result = await apiFetch<{ ok: true; emailSent: boolean }>("/api/auth/register", {
        method: "POST",
        body: parsed.data,
      });
      setOutcome({ emailSent: result.emailSent });
      /**
       * Deliberately no `router.refresh()` here.
       *
       * Registration sets session cookies, so the visitor is now authenticated —
       * and middleware redirects an authenticated visitor away from /register.
       * Refreshing therefore replaced this success screen with the dashboard
       * before it could be read, which is where the account is told that
       * confirming the address is what unlocks filing. That message is the whole
       * point of the screen.
       *
       * Nothing is stale as a result: the buttons below are real navigations,
       * and the server re-renders the header with the new session on any of them.
       */
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        setFieldErrors(error.fieldErrors());
      }
      setFormError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (outcome) {
    return (
      <div className="space-y-5">
        <Callout tone="success" title="Your account is ready">
          {outcome.emailSent
            ? "We have sent a confirmation link to your email address. Confirm it and you can file a report."
            : "Your account was created, but the confirmation email could not be sent. You can ask for it again from your dashboard."}
        </Callout>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" className="w-full" onClick={() => router.push("/dashboard")}>
            Go to my dashboard
          </Button>
        </div>

        <p className="text-xs leading-relaxed text-ink-subtle">
          Not arrived after a few minutes? Check your spam folder, then use the resend button on
          your dashboard.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError ? (
        <Callout tone="danger" title="Could not create your account">
          {formError}
        </Callout>
      ) : null}

      <Field
        label="Your name"
        hint="Shown on notifications and to reviewers. Not shown to the public."
        error={fieldErrors.fullName}
      >
        {(props) => (
          <Input
            {...props}
            name="fullName"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            autoComplete="name"
            autoFocus
            placeholder="Your full name"
          />
        )}
      </Field>

      <Field label="Email address" error={fieldErrors.email} required>
        {(props) => (
          <Input
            {...props}
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            spellCheck={false}
          />
        )}
      </Field>

      <Field
        label="Password"
        hint="At least 10 characters, with an uppercase letter, a lowercase letter and a number."
        error={fieldErrors.password}
        required
      >
        {(props) => (
          <PasswordInput
            {...props}
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            placeholder="Choose a password"
            showStrength
          />
        )}
      </Field>

      <Button
        type="submit"
        size="lg"
        loading={submitting}
        loadingLabel="Creating your account"
        className="w-full"
      >
        Create account
      </Button>
    </form>
  );
}
