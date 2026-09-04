"use client";

import { CheckCheck, Link2, ShieldAlert, UserCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useSession } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";
import type { NotificationType } from "@/db/enums";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string | null;
  isRead: boolean;
  createdAt: string;
}

const PRESENTATION: Record<NotificationType, { Icon: typeof Link2; tint: string }> = {
  report_status_changed: { Icon: UserCheck, tint: "bg-primary-soft text-primary" },
  possible_match_found: { Icon: Link2, tint: "bg-found-soft text-found-fg" },
  match_confirmed: { Icon: CheckCheck, tint: "bg-positive-soft text-positive-fg" },
  match_dismissed: { Icon: XCircle, tint: "bg-surface-sunken text-ink-muted" },
  account_security: { Icon: ShieldAlert, tint: "bg-caution-soft text-caution-fg" },
};

/**
 * The notification list, with read state.
 *
 * ## Optimistic, but reconciled
 *
 * Marking one read updates the list immediately and calls the API in the
 * background. If the call fails the change is rolled back and a toast explains
 * why — rather than leaving the list showing a state the server does not agree
 * with, which is how somebody comes to believe they have already read the
 * notification telling them a match was found.
 *
 * ## The unread count is shared
 *
 * The header's bell reads the same count from the session context, so marking
 * something read here updates the badge without a refetch or a navigation.
 */
export function NotificationList({ initialItems }: { initialItems: NotificationItem[] }) {
  const toast = useToast();
  const { setUnreadNotifications } = useSession();
  const [items, setItems] = useState(initialItems);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = items.filter((item) => !item.isRead).length;

  function applyUnread(next: NotificationItem[]) {
    setItems(next);
    setUnreadNotifications(next.filter((item) => !item.isRead).length);
  }

  async function markRead(id: string) {
    const before = items;
    const target = items.find((item) => item.id === id);
    if (!target || target.isRead) return;

    applyUnread(items.map((item) => (item.id === id ? { ...item, isRead: true } : item)));

    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: "POST" });
    } catch (error) {
      applyUnread(before);
      toast.error(errorMessage(error));
    }
  }

  async function markAllRead() {
    const before = items;
    setMarkingAll(true);
    applyUnread(items.map((item) => ({ ...item, isRead: true })));

    try {
      await apiFetch("/api/notifications/read-all", { method: "POST" });
    } catch (error) {
      applyUnread(before);
      toast.error(errorMessage(error));
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div className="space-y-4">
      {unreadCount > 0 ? (
        <div className="flex items-center justify-between gap-4">
          <p aria-live="polite" className="text-sm text-ink-muted">
            {unreadCount} unread
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void markAllRead()}
            loading={markingAll}
            loadingLabel="Marking all read"
          >
            <CheckCheck aria-hidden className="size-3.5" />
            Mark all read
          </Button>
        </div>
      ) : null}

      <ul className="space-y-2">
        {items.map((item) => {
          const { Icon, tint } = PRESENTATION[item.type];

          const content = (
            <div className="flex gap-3">
              <span
                className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", tint)}
              >
                <Icon aria-hidden className="size-4" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p
                    className={cn(
                      "text-sm leading-snug",
                      item.isRead ? "font-medium text-ink-muted" : "font-semibold text-ink",
                    )}
                  >
                    {item.title}
                  </p>
                  {!item.isRead ? (
                    <span
                      // The dot is decorative; "unread" is carried in the
                      // wrapper's accessible text below.
                      aria-hidden
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-accent"
                    />
                  ) : null}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{item.body}</p>
                <p className="mt-1.5 text-xs text-ink-subtle">
                  {formatRelative(item.createdAt)}
                  {!item.isRead ? <span className="sr-only"> · unread</span> : null}
                </p>
              </div>
            </div>
          );

          return (
            <li key={item.id}>
              {item.href ? (
                <Link
                  href={item.href}
                  // Marked read on the way out, so following a notification
                  // does not leave it sitting unread afterwards.
                  onClick={() => void markRead(item.id)}
                  className={cn(
                    "block rounded-xl border px-4 py-3.5 transition-colors",
                    item.isRead
                      ? "border-line bg-surface hover:bg-surface-hover"
                      : "border-accent/25 bg-accent-soft/40 hover:bg-accent-soft/60",
                  )}
                >
                  {content}
                </Link>
              ) : (
                <div
                  className={cn(
                    "rounded-xl border px-4 py-3.5",
                    item.isRead ? "border-line bg-surface" : "border-accent/25 bg-accent-soft/40",
                  )}
                >
                  {content}
                  {!item.isRead ? (
                    <div className="mt-2 flex justify-end">
                      <Button variant="ghost" size="sm" onClick={() => void markRead(item.id)}>
                        Mark read
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
