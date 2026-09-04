import { redirect } from "next/navigation";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getCurrentUser } from "@/server/auth/current-user";

/**
 * The shell for every signed-in page: dashboard, reports, notifications,
 * settings.
 *
 * ## The redirect here is the real one
 *
 * `middleware.ts` also redirects an anonymous visitor away from these paths,
 * but that is a convenience — it runs on the Edge with no database and can only
 * see that a signed token exists. This check loads the live user row, so it is
 * what actually catches a token for an account that has since been deleted or
 * suspended.
 *
 * Each page below additionally calls `requireUser` (or `requireVerifiedUser`)
 * before doing anything with data. That is not redundant: a layout is not a
 * security boundary in the App Router — it renders in parallel with its pages
 * rather than gating them — so a page that relied on this layout having checked
 * would be relying on an ordering guarantee that does not exist.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
