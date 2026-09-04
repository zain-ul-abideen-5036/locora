"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiFetch, ApiError, errorMessage } from "@/lib/api-client";

export function ProfileForm({ initialFullName }: { initialFullName: string }) {
  const toast = useToast();
  const [fullName, setFullName] = useState(initialFullName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Disabled until something actually changes, so "Save" never sits there
  // inviting a pointless round trip.
  const dirty = fullName.trim() !== initialFullName.trim();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      await apiFetch("/api/account/profile", {
        method: "PATCH",
        body: { fullName: fullName.trim(), phone: null },
      });
      toast.success("Your details were saved.");
    } catch (caught) {
      if (caught instanceof ApiError && caught.fields) {
        setError(caught.fieldErrors().fullName ?? errorMessage(caught));
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Field label="Your name" error={error}>
        {(props) => (
          <Input
            {...props}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            maxLength={120}
            autoComplete="name"
            placeholder="Your full name"
          />
        )}
      </Field>

      <Button type="submit" loading={saving} loadingLabel="Saving" disabled={!dirty}>
        Save
      </Button>
    </form>
  );
}
