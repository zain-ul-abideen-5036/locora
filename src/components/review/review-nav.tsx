"use client";

import { ClipboardList, Flag, Link2, ScrollText, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

const ICONS = {
  queue: ClipboardList,
  matches: Link2,
  flags: Flag,
  users: Users,
  audit: ScrollText,
} as const;

export interface ReviewNavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  count: number;
}

/**
 * The console's navigation, with live queue counts.
 *
 * A client component only so it can mark the current section. The counts come
 * from the layout, which reads them in one round trip on the server, rather
 * than being polled from the browser.
 *
 * The count is inside the link's accessible name, not floating beside it as a
 * bare number — "Review queue, 7 waiting" rather than "Review queue" followed
 * by an unexplained "7".
 */
export function ReviewNav({ items }: { items: ReviewNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Review sections">
      {/* Horizontally scrollable on a phone rather than wrapped into three
          ragged rows, and a plain column from lg up. */}
      <ul className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href} className="shrink-0 lg:shrink">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={item.count > 0 ? `${item.label}, ${item.count} waiting` : item.label}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-surface-sunken text-ink"
                    : "text-ink-muted hover:bg-surface-hover hover:text-ink",
                )}
              >
                <Icon aria-hidden className="size-4 shrink-0" />
                <span className="whitespace-nowrap">{item.label}</span>
                {item.count > 0 ? (
                  <span
                    aria-hidden
                    className={cn(
                      "ml-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-2xs font-semibold",
                      active ? "bg-primary text-primary-fg" : "bg-critical text-white",
                    )}
                    data-numeric
                  >
                    {item.count > 99 ? "99+" : item.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
