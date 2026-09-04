import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

/**
 * The shell for every public page: the landing page, the case feed, individual
 * cases, and the two explanatory pages.
 *
 * A route group rather than a path segment, so these pages share a layout
 * without `/site` appearing in any URL. Nothing here requires a session — a
 * stranger recognising a face is the point of the public half of this product —
 * but the header renders differently when there is one, which it reads from the
 * session context the root layout has already resolved.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    // A column with the main region grown to fill: without it, a short page
    // leaves the footer floating in the middle of a tall viewport.
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
