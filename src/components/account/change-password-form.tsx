"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Callout } from "@/components/ui/feedback";
import { PasswordInput } from "@/components/ui/password-input";
import { useToast } from "@/components/ui/toast";
import { apiFetch, ApiError, errorMessage } from "@/lib/api-client";
import { changePasswordSchema } from "@/lib/validation/auth";

export function ChangePasswordForm() {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errors[issue.path.map(String).join(".") || "_"] ??= issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    // Checked here only. A confirmation field guards against a typo, which is a
    // client-side concern; sending it would make the server hold a second copy
    // of a password in memory for no benefit.
    if (newPassword !== confirm) {
      setFieldErrors({ confirm: "These two passwords do not match." });
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/api/auth/change-password", { method: "POST", body: parsed.data });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      toast.success("Password changed. Every other device has been signed out.");
    } catch (error) {
      if (error instanceof ApiError && error.fields) setFieldErrors(error.fieldErrors());
      setFormError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError ? <Callout tone="danger">{formError}</Callout> : null}

      <Field label="Current password" error={fieldErrors.currentPassword} required>
        {(props) => (
          <PasswordInput
            {...props}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
          />
        )}
      </Field>

      <Field
        label="New password"
        hint="At least 10 characters, with an uppercase letter, a lowercase letter and a number."
        error={fieldErrors.newPassword}
        required
      >
        {(props) => (
          <PasswordInput
            {...props}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            showStrength
          />
        )}
      </Field>

      <Field label="Confirm new password" error={fieldErrors.confirm} required>
        {(props) => (
          <PasswordInput
            {...props}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
          />
        )}
      </Field>

      <Button type="submit" loading={saving} loadingLabel="Changing your password">
        Change password
      </Button>
    </form>
  );
}
