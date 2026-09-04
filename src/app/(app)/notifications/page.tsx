import { BellOff } from "lucide-react";
import type { Metadata } from "next";

import { NotificationList } from "@/components/account/notification-list";
import { EmptyState } from "@/components/ui/feedback";
import { requireUser } from "@/server/auth/current-user";
import { listForUser } from "@/server/notifications/service";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Notifications.
 *
 * Rendered on the server with the list already in it, then handed to a client
 * component that owns the read/unread interaction. That split means the page is
 * useful immediately — including to a screen reader, and before JavaScript
 * arrives — while marking one read does not require a navigation.
 */
export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await listForUser(user.id, { limit: 50 });

  return (
    <div className="container-page max-w-2xl py-10 sm:py-14">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Notifications
        </h1>
        <p className="mt-2 text-base text-ink-muted">
          Status changes on your reports, and possible matches. Locora does not send anything else.
        </p>
      </header>

      <div className="mt-8">
        {items.length === 0 ? (
          <EmptyState
            icon={<BellOff aria-hidden className="size-5" />}
            title="Nothing yet"
            description="When a reviewer publishes one of your reports, or links it to another, you will find it here — and we will email you."
          />
        ) : (
          <NotificationList initialItems={items} />
        )}
      </div>
    </div>
  );
}
