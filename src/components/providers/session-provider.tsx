"use client";

/**
 * The signed-in user, available to client components.
 *
 * ## Seeded from the server, not fetched on mount
 *
 * The initial value is passed in from the root layout, which already knows who
 * the caller is. Fetching `/api/auth/me` on mount instead would mean every page
 * renders once as though nobody is signed in and then corrects itself — a
 * visible flash of the signed-out header on every navigation, and a layout
 * shift as the account menu appears.
 *
 * ## This is not an authorisation mechanism
 *
 * Nothing here is trusted for anything. `role` is used to decide whether to
 * *show* a link to the review console; the console itself calls `requireAdmin`
 * server-side against the live database row. Editing this state in a devtools
 * console gets somebody a menu item and a 403.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { apiFetch } from "@/lib/api-client";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
  role: "user" | "admin";
  isEmailVerified: boolean;
}

interface SessionContextValue {
  user: SessionUser | null;
  unreadNotifications: number;
  /** Re-reads the session from the server, e.g. after confirming an address. */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  setUnreadNotifications: (count: number) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

interface MeResponse {
  user: SessionUser | null;
  unreadNotifications: number;
}

export function SessionProvider({
  initialUser,
  initialUnread,
  children,
}: {
  initialUser: SessionUser | null;
  initialUnread: number;
  children: ReactNode;
}) {
  const [user, setUser] = useState<SessionUser | null>(initialUser);
  const [unreadNotifications, setUnreadNotifications] = useState(initialUnread);

  // Keeps the context in step when a server navigation returns a different
  // session — signing in, signing out, or an address being confirmed in another
  // tab all change what the layout passes down.
  useEffect(() => {
    setUser(initialUser);
    setUnreadNotifications(initialUnread);
  }, [initialUser, initialUnread]);

  const refresh = useCallback(async () => {
    try {
      const result = await apiFetch<MeResponse>("/api/auth/me");
      setUser(result.user);
      setUnreadNotifications(result.unreadNotifications);
    } catch {
      // A failure here means the network is down or the session is gone. Both
      // are handled by the next real request; blanking the user on a transient
      // failure would sign somebody out because their train went into a tunnel.
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } finally {
      /**
       * A full document navigation, not a client-side push.
       *
       * Two reasons, and the second is the important one on this product.
       *
       * A client-side push leaves every cached RSC payload and every piece of
       * component state in place. After signing out, the previous user's
       * dashboard — their cases, and the contact details on them — is still in
       * the client cache, one Back button away, on what may well be a shared or
       * public computer.
       *
       * It also avoids a race: clearing the user re-renders any page that
       * requires a session, which fires its own redirect to the sign-in page
       * and beats the caller's navigation.
       */
      window.location.assign("/");
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ user, unreadNotifications, refresh, signOut, setUnreadNotifications }),
    [user, unreadNotifications, refresh, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside a SessionProvider");
  return context;
}
