import type { MetadataRoute } from "next";

import { resolveSiteUrl } from "@/server/config/env";

/**
 * Robots policy.
 *
 * The public half of the site should be crawled — a family's best chance is
 * somebody searching a name and finding the case. Everything behind a sign-in
 * is disallowed, and so is the whole of /api and every found-person case.
 *
 * Found-person cases are excluded here as well as by their own noindex, because
 * the two do different jobs: a `Disallow` stops a crawler fetching the page at
 * all, while `noindex` only stops it appearing in results after it has been
 * read. For a page about an unidentified, often vulnerable person who has
 * consented to nothing, not being fetched is the better outcome.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = resolveSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/cases", "/cases/missing/", "/how-it-works", "/safety"],
        disallow: [
          "/api/",
          "/dashboard",
          "/report",
          "/review",
          "/settings",
          "/notifications",
          "/login",
          "/register",
          "/forgot-password",
          "/reset-password",
          "/verify-email",
          "/cases/found/",
        ],
      },
    ],
    sitemap: `${siteUrl.origin}/sitemap.xml`,
    host: siteUrl.origin,
  };
}
