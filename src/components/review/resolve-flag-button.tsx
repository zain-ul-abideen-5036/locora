"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { apiFetch, errorMessage } from "@/lib/api-client";

/**
 * Marks a flag as dealt with.
 *
 * Deliberately separate from acting on the case itself. Resolving a flag says
 * "a reviewer has looked at this", not "the report was removed" — a flag is
 * often correctly resolved with no change to the case at all, and conflating
 * the two would mean a reviewer could not clear a spurious complaint without
 * appearing to have acted on it.
 */
export function ResolveFlagButton({ flagId }: { flagId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [working, setWorking] = useState(false);

  async function resolve() {
    setWorking(true);
    try {
      await apiFetch(`/api/review/flags/${flagId}`, { method: "PATCH" });
      toast.success("Flag cleared.");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => void resolve()}
      loading={working}
      loadingLabel="Clearing"
    >
      <CheckCircle2 aria-hidden className="size-3.5" />
      Mark as handled
    </Button>
  );
}
