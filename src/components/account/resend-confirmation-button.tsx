"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";

/**
 * Asks for a fresh confirmation link.
 *
 * The outcome is reported honestly. If the server says the email could not be
 * handed off — no SMTP configured, a provider refusing — the button says so
 * rather than showing a cheerful "sent!" for a message that is not coming. A
 * user who then waits twenty minutes for nothing has been actively misled, and
 * on this product that twenty minutes is time they cannot file a report.
 */
export function ResendConfirmationButton() {
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [sentOnce, setSentOnce] = useState(false);

  async function resend() {
    setSending(true);
    try {
      const result = await apiFetch<{ ok: true; emailSent: boolean }>(
        "/api/auth/resend-verification",
        { method: "POST" },
      );

      if (result.emailSent) {
        setSentOnce(true);
        toast.success("Confirmation link sent. Check your inbox, and your spam folder.");
      } else {
        toast.error(
          "Locora could not send the email just now. Please try again in a few minutes.",
        );
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => void resend()}
      loading={sending}
      loadingLabel="Sending the link"
    >
      {sentOnce ? "Send it again" : "Resend confirmation link"}
    </Button>
  );
}
