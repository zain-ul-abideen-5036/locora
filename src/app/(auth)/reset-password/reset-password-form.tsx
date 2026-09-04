"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Callout } from "@/components/ui/feedback";
import { PasswordInput } from "@/components/ui/password-input";
import { apiFetch, ApiError, errorMessage } from "@/lib/api-client";
import { passwordSchema } from "@/lib/validation/auth";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setFieldErrors({ password: parsed.error.issues[0]?.message ?? "That password is not strong enough." });
      return;
    }

    /**
     * The confirmation field is checked here and does not exist server-side.
     *
     * That is correct rather than an omission: it guards against a typo, which
     * is a client-side concern. Sending it would mean the server had to hold a
     * second copy of a password in memory for no security benefit.
     */
    if (password !== confirm) {
      setFieldErrors({ confirm: "These two passwords do not match." });
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: { token, password },
      });
      // Straight to sign-in with a flag, rather than a success screen here. The
      // session was revoked server-side, so there is nothing to stay on this
      // page for, and the confirmation appears where it is useful.
      router.replace("/login?reset=1");
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
      {formError ? (
        <Callout tone="danger" title="Could not reset your password">
          <p>{formError}</p>
          <p className="mt-2">
            <Link href="/forgot-password" className="font-medium">
              Request a new link
            </Link>
          </p>
        </Callout>
      ) : null}

      <Field
        label="New password"
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
            autoFocus
            placeholder="Choose a password"
            showStrength
          />
        )}
      </Field>

      <Field label="Confirm new password" error={fieldErrors.confirm} required>
        {(props) => (
          <PasswordInput
            {...props}
            name="confirm"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            placeholder="Type it again"
          />
        )}
      </Field>

      <Button
        type="submit"
        size="lg"
        loading={submitting}
        loadingLabel="Saving your new password"
        className="w-full"
      >
        Set new password
      </Button>
    </form>
  );
}
