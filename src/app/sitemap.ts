import type { MetadataRoute } from "next";

import { resolveSiteUrl } from "@/server/config/env";
import { listMissingFeed } from "@/server/reports/queries";
import { logger } from "@/server/observability/logger";

/**
 * The sitemap.
 *
 * Lists the static public pages plus every published missing-person case, so a
 * crawler finds them without waiting to follow links through a paginated feed.
 *
 * Found-person cases are deliberately absent, matching robots.ts: there is no
 * name to search for, so indexing offers almost nothing, while the subject has
 * consented to nothing and a search cache outlives the case being taken down.
 *
 * Capped at 5,000 entries. The protocol's own limit is 50,000, but this is
 * generated per request against a live database and an unbounded query here
 * would make a crawler's fetch the most expensive request the application
 * serves. If Locora ever holds more than that, this becomes a sitemap index.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = resolveSiteUrl().origin;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: origin, changeFrequency: "hourly", priority: 1 },
    { url: `${origin}/cases`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${origin}/how-it-works`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${origin}/safety`, changeFrequency: "monthly", priority: 0.5 },
  ];

  try {
    // Read as an anonymous viewer, so this cannot pick up anything a stranger
    // could not already see.
    const page = await listMissingFeed({}, { offset: 0, limit: 5000 }, null);

    return [
      ...staticRoutes,
      ...page.items.map((report) => ({
        url: `${origin}/cases/missing/${report.id}`,
        lastModified: new Date(report.updatedAt),
        changeFrequency: "daily" as const,
        priority: 0.8,
      })),
    ];
  } catch (error) {
    // A database problem must not take the sitemap down with it — the static
    // routes are still worth serving, and a 500 here tells a crawler the whole
    // site is broken.
    logger.error("Could not list cases for the sitemap", {
      error: error instanceof Error ? error.message : String(error),
    });
    return staticRoutes;
  }
}
