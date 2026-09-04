import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";

import { SessionProvider } from "@/components/providers/session-provider";
import { ThemeProvider, ThemeScript } from "@/components/providers/theme";
import { ToastProvider } from "@/components/ui/toast";
import { getCurrentUser } from "@/server/auth/current-user";
import { resolveSiteUrl } from "@/server/config/env";
import { countUnread } from "@/server/notifications/service";

import "./globals.css";

/**
 * Type.
 *
 * Two families, each with a job.
 *
 * Inter carries the interface: forms, tables, navigation, the review console.
 * It is designed for screen text at small sizes, which is most of this product.
 *
 * Source Serif carries display text — the hero, section headings, and a
 * person's name on a case page. A serif is not decoration here. Locora sits
 * closer to a public register than to a consumer app, and an editorial serif is
 * what gives a name on a case the weight of a record rather than the look of a
 * product card. It is used sparingly and never below 1rem.
 *
 * `next/font` self-hosts both at build time: the files are served from this
 * origin, so there is no third-party request, no entry needed in the
 * Content-Security-Policy, and no flash of fallback text. `display: "swap"`
 * still applies for the brief moment before they load.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  // Only the weights actually used. Every extra weight is a font file a visitor
  // downloads and never sees.
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-source-serif",
});

const siteUrl = resolveSiteUrl();

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "Locora — Find what matters.",
    // Applied to every page that sets its own title, so the product name is
    // always present in a browser tab and a shared link.
    template: "%s · Locora",
  },
  description:
    "Locora is a platform for reporting missing people, reporting people who have been found, and helping reunite them with their families.",
  applicationName: "Locora",
  openGraph: {
    type: "website",
    siteName: "Locora",
    title: "Locora — Find what matters.",
    description:
      "Report a missing person, report someone who has been found, and help reunite them with their families.",
    url: siteUrl.origin,
  },
  twitter: {
    card: "summary_large_image",
    title: "Locora — Find what matters.",
    description:
      "Report a missing person, report someone who has been found, and help reunite them with their families.",
  },
  robots: {
    // The public pages should be findable — a family's best chance is somebody
    // recognising a face. Individual case pages opt out separately; see
    // src/app/cases/[kind]/[id]/page.tsx and app/robots.ts.
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom is deliberately not capped. `maximum-scale=1` is a common default that
  // stops a low-vision user pinching to read, and it buys nothing.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1116" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolved here so the client session context starts with the right value
  // instead of every page flashing its signed-out state and correcting itself.
  const user = await getCurrentUser();
  const unread = user ? await countUnread(user.id) : 0;

  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable}`} suppressHydrationWarning>
      <head>
        {/* Before anything paints — see the note in providers/theme.tsx. */}
        <ThemeScript />
      </head>
      <body>
        {/* Without this, a keyboard user tabs through the whole header on every
            page before reaching the content. */}
        <a href="#main" className="skip-link">
          <span className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg shadow-lg">
            Skip to content
          </span>
        </a>

        <ThemeProvider>
          <SessionProvider
            initialUser={
              user
                ? {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                    role: user.role,
                    isEmailVerified: user.isEmailVerified,
                  }
                : null
            }
            initialUnread={unread}
          >
            <ToastProvider>{children}</ToastProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
