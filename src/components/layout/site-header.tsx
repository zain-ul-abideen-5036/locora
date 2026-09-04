"use client";

/**
 * The application header.
 *
 * A client component because it holds the mobile menu and the account menu, and
 * because it reads the session context. Everything it renders that matters —
 * which links exist for whom — is decided from the session the server already
 * resolved, so there is no fetch on mount and no signed-out flash.
 */

import { Bell, LogOut, Menu, Plus, Settings, ShieldCheck, User, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { LocoraWordmark } from "@/components/brand/logo";
import { useSession } from "@/components/providers/session-provider";
import { ThemeToggle } from "@/components/providers/theme";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const NAV_LINKS = [
  { href: "/cases", label: "Browse cases" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/safety", label: "Safety & privacy" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { user, unreadNotifications } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  /**
   * A route change closes the menu.
   *
   * Adjusted during render, guarded by the last path this component rendered
   * for, rather than in an effect. Without any reset, tapping a link leaves the
   * panel covering the page it just navigated to; done in an effect, the new
   * page paints once with the menu still open. Closing it in each link's
   * `onClick` would miss navigation by browser Back, which also changes the
   * path.
   */
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMobileOpen(false);
  }

  // Locks background scroll while the mobile overlay is open, and always
  // releases it — including if the header unmounts mid-navigation.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-line",
        // Translucent with a blur, but with a solid fallback colour underneath:
        // `backdrop-filter` is unsupported in some browsers and disabled by
        // some privacy settings, and without the fallback the header would be
        // transparent and the content would scroll through it illegibly.
        "bg-canvas/85 backdrop-blur-md supports-[not(backdrop-filter:blur(0))]:bg-canvas",
      )}
    >
      <div className="container-page">
        <div className="flex h-16 items-center gap-4">
          <Link
            href="/"
            className="shrink-0 rounded-md"
            aria-label="Locora — home"
          >
            <LocoraWordmark size="md" />
          </Link>

          {/* Desktop navigation */}
          <nav aria-label="Main" className="ml-4 hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive(link.href)
                    ? "bg-surface-sunken text-ink"
                    : "text-ink-muted hover:bg-surface-hover hover:text-ink",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle className="hidden sm:inline-flex" />

            {user ? (
              <>
                <NotificationBell count={unreadNotifications} />
                <ButtonLink href="/report" variant="primary" size="sm" className="hidden sm:inline-flex">
                  <Plus aria-hidden className="size-4" />
                  File a report
                </ButtonLink>
                <AccountMenu />
              </>
            ) : (
              <>
                <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
                  Sign in
                </ButtonLink>
                <ButtonLink href="/register" variant="primary" size="sm">
                  Get started
                </ButtonLink>
              </>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="px-2 lg:hidden"
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              onClick={() => setMobileOpen((open) => !open)}
            >
              {mobileOpen ? (
                <X aria-hidden className="size-5" />
              ) : (
                <Menu aria-hidden className="size-5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile navigation.
          Rendered as a panel below the header rather than a full-screen
          takeover, so the page underneath stays visible and the visitor keeps
          their bearings. */}
      {mobileOpen ? (
        <div
          id="mobile-navigation"
          className="border-t border-line bg-canvas lg:hidden"
        >
          <nav aria-label="Main" className="container-page flex flex-col gap-1 py-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={cn(
                  // 44px minimum height: a 32px row is comfortably below the
                  // size at which a target is reliably tappable.
                  "flex min-h-11 items-center rounded-md px-3 text-base font-medium",
                  isActive(link.href) ? "bg-surface-sunken text-ink" : "text-ink-muted",
                )}
              >
                {link.label}
              </Link>
            ))}

            <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3">
              {user ? (
                <ButtonLink href="/report" variant="primary" size="md">
                  <Plus aria-hidden className="size-4" />
                  File a report
                </ButtonLink>
              ) : (
                <ButtonLink href="/login" variant="secondary" size="md">
                  Sign in
                </ButtonLink>
              )}
              <div className="flex items-center justify-between px-1 pt-1">
                <span className="text-sm text-ink-muted">Theme</span>
                <ThemeToggle />
              </div>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

function NotificationBell({ count }: { count: number }) {
  return (
    <Link
      href="/notifications"
      className={cn(
        "relative flex size-9 items-center justify-center rounded-md",
        "text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink",
      )}
      // The count is in the accessible name rather than only in the badge, so a
      // screen-reader user hears "Notifications, 3 unread" instead of
      // "Notifications" and a number floating nearby.
      aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
    >
      <Bell aria-hidden className="size-4.5" />
      {count > 0 ? (
        <span
          aria-hidden
          className={cn(
            "absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center",
            "rounded-full bg-critical px-1 text-2xs font-semibold text-white",
          )}
        >
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * The account menu.
 *
 * Built from a button and a positioned list rather than a native `<select>`,
 * because the items are links and actions rather than values. Keyboard and
 * outside-click handling is wired by hand, which is the cost of that: Escape
 * closes it and returns focus to the trigger, and a click anywhere else
 * dismisses it.
 */
function AccountMenu() {
  const { user, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const label = user.fullName?.trim() || user.email;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex size-9 items-center justify-center rounded-full border border-line",
          "bg-surface text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink",
        )}
        aria-label={`Account menu for ${label}`}
      >
        <User aria-hidden className="size-4" />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className={cn(
            "absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-lg",
            "border border-line bg-surface shadow-lg animate-fade-up",
          )}
        >
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-sm font-medium text-ink">{label}</p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
          </div>

          <div className="p-1">
            <MenuLink href="/dashboard" icon={<User aria-hidden className="size-4" />}>
              My cases
            </MenuLink>
            {user.role === "admin" ? (
              <MenuLink href="/review" icon={<ShieldCheck aria-hidden className="size-4" />}>
                Review console
              </MenuLink>
            ) : null}
            <MenuLink href="/settings" icon={<Settings aria-hidden className="size-4" />}>
              Settings
            </MenuLink>
          </div>

          <div className="border-t border-line p-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => void signOut()}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm",
                "text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink",
              )}
            >
              <LogOut aria-hidden className="size-4" />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
        "text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
