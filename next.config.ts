import type { NextConfig } from "next";

/**
 * Next.js configuration.
 *
 * Security headers live here rather than in middleware because Vercel applies
 * `headers()` at its edge, before a function is invoked — middleware would cost
 * an invocation on every route just to set a handful of static strings.
 */

/**
 * Content-Security-Policy.
 *
 * `'unsafe-inline'` on script-src is required by the App Router: it inlines
 * bootstrap and flight-data scripts, and the theme script in <head> has to run
 * before first paint or the page flashes the wrong colours. A nonce is the
 * textbook answer, but a nonce forces every route to render dynamically, which
 * would discard static generation for the whole public site. Locora renders no
 * user-authored HTML anywhere — every piece of user content goes through
 * React's escaping as text — so that trade is the right one here.
 *
 * Sources are assembled from a filtered array rather than interpolated into a
 * template string. An empty interpolation is not harmless in a CSP: it either
 * leaves a stray token the browser rejects, or emits the literal "null", which
 * is a real CSP keyword meaning the opaque origin. Either way the directive
 * silently stops doing what it appears to do.
 */
function directive(name: string, ...sources: (string | false | undefined)[]): string {
  return [name, ...sources.filter(Boolean)].join(" ");
}

function buildContentSecurityPolicy(): string {
  return [
    directive("default-src", "'self'"),
    directive("script-src", "'self'", "'unsafe-inline'"),
    directive("style-src", "'self'", "'unsafe-inline'"),
    // Report photos are served from Vercel Blob; blob: is the local preview in
    // the photo picker before anything is uploaded.
    directive("img-src", "'self'", "data:", "blob:", "https://*.public.blob.vercel-storage.com", "https://*.tile.openstreetmap.org"),
    directive("font-src", "'self'", "data:"),
    // OpenStreetMap raster tiles back the location picker.
    directive("connect-src", "'self'", "https://*.tile.openstreetmap.org"),
    directive("frame-ancestors", "'none'"),
    directive("base-uri", "'self'"),
    directive("form-action", "'self'"),
    directive("object-src", "'none'"),
    "upgrade-insecure-requests",
  ].join("; ");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Set explicitly, matching the default, so nobody "fixes" a red deploy by
  // turning type checking off. Linting is a separate CI step in Next 16 rather
  // than part of `next build`, so it has no equivalent switch here.
  typescript: { ignoreBuildErrors: false },

  // Otherwise every response advertises the exact Next.js version in use.
  poweredByHeader: false,

  images: {
    // Report photos live in Vercel Blob. The store id is part of the hostname
    // and differs per project, so the pattern is a wildcard rather than a
    // literal host.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
    formats: ["image/avif", "image/webp"],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: buildContentSecurityPolicy() },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            // Geolocation stays allowed same-origin: the location picker offers
            // a "use my current location" shortcut. Everything else is denied,
            // so a compromised dependency cannot quietly ask for it either.
            value: "geolocation=(self), microphone=(), camera=(), payment=(), usb=()",
          },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      {
        // A case page carries a named person and their photograph. It should be
        // reachable by anyone with the link, but never cached by an
        // intermediary — least of all after the case is resolved and taken down.
        source: "/cases/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        // Nothing under the API is ever cacheable, and several routes return
        // owner-only contact details.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
    ];
  },
};

export default nextConfig;
