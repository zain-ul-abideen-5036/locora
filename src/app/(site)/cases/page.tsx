import { SearchX, UserSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CaseCard } from "@/components/cases/case-card";
import { FeedFilters } from "@/components/cases/feed-filters";
import { ButtonLink } from "@/components/ui/button";
import { CaseGridSkeleton, EmptyState } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import { paginationSchema } from "@/lib/validation/common";
import { feedFiltersSchema, hasActiveFilters } from "@/lib/validation/reports";
import { getCurrentUser } from "@/server/auth/current-user";
import { listFeedCities, listFoundFeed, listMissingFeed } from "@/server/reports/queries";

export const metadata: Metadata = {
  title: "Browse cases",
  description:
    "Published missing-person and found-person cases on Locora. Take a moment to look — recognising one face is the whole point.",
};

/**
 * The public case feed.
 *
 * ## Rendered on the server, filtered in the database
 *
 * Filters arrive as query parameters and become SQL. Nothing is fetched from a
 * browser, and no filtering happens in one. The alternative — loading every
 * published case and filtering client-side — is a page that gets slower with
 * every case filed and eventually ships the whole register to anybody who opens
 * it.
 *
 * ## Not cached
 *
 * `force-dynamic`, deliberately. A case published a minute ago must appear, and
 * a case resolved a minute ago must stop appearing. Caching this even briefly
 * would mean showing strangers a photograph of somebody who has already been
 * found — which is precisely the thing this product removes cases to avoid.
 */
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const kind = params.kind === "found" ? "found" : "missing";

  return (
    <div className="container-page py-10 sm:py-14">
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Browse cases
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-muted">
          Every case here has been reviewed and published by a person. Contact details are never
          shown — if you recognise someone, use the button on their case to tell us.
        </p>
      </header>

      <div className="mt-8">
        <KindTabs kind={kind} params={params} />
      </div>

      {/*
        Suspense with a key on the whole query string.
        The key is what makes the skeleton appear on a *filter change* and not
        only on first load: without it React reuses the existing subtree and the
        old results sit there, apparently unfiltered, until the new ones arrive.
      */}
      <Suspense key={JSON.stringify(params)} fallback={<FeedLoading />}>
        <Feed kind={kind} params={params} />
      </Suspense>
    </div>
  );
}

function FeedLoading() {
  return (
    <div className="mt-6 space-y-6">
      <div className="h-[7.5rem] rounded-xl border border-line bg-surface" />
      <CaseGridSkeleton />
    </div>
  );
}

function KindTabs({ kind, params }: { kind: "missing" | "found"; params: SearchParams }) {
  // Filters are carried across the tab switch, minus the kind itself. Somebody
  // who has narrowed to a city expects to stay narrowed when they look at the
  // other kind of report.
  const carried = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "kind" || key === "offset") continue;
    if (typeof value === "string" && value !== "") carried.set(key, value);
  }

  const tabs = [
    { value: "missing" as const, label: "Missing people" },
    { value: "found" as const, label: "People found" },
  ];

  return (
    // A tablist would need arrow-key handling and panel wiring; these are links
    // that change the page, so they are marked up as what they are and given
    // aria-current instead.
    <nav aria-label="Case type" className="flex gap-1 border-b border-line">
      {tabs.map((tab) => {
        const query = new URLSearchParams(carried);
        query.set("kind", tab.value);
        const active = kind === tab.value;

        return (
          <Link
            key={tab.value}
            href={`/cases?${query.toString()}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              active
                ? tab.value === "missing"
                  ? "border-missing text-ink"
                  : "border-found text-ink"
                : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

async function Feed({ kind, params }: { kind: "missing" | "found"; params: SearchParams }) {
  const viewer = await getCurrentUser();

  const filters = feedFiltersSchema.parse(params);
  const pagination = paginationSchema.parse(params);

  const [page, cities] = await Promise.all([
    kind === "missing"
      ? listMissingFeed(filters, pagination, viewer)
      : listFoundFeed(filters, pagination, viewer),
    listFeedCities(kind),
  ]);

  const filtered = hasActiveFilters(filters);
  const activeCount = [
    filters.query,
    filters.city,
    filters.gender,
    filters.minAge,
    filters.maxAge,
  ].filter((value) => value !== undefined && value !== "").length;

  return (
    <div className="mt-6 space-y-6">
      <FeedFilters
        kind={kind}
        cities={cities}
        activeCount={activeCount}
        values={{
          query: filters.query,
          city: filters.city,
          gender: filters.gender,
          minAge: filters.minAge?.toString(),
          maxAge: filters.maxAge?.toString(),
          sort: filters.sort,
        }}
      />

      {/* A live region, so a screen-reader user is told the result count
          changed after a filter navigation rather than having to go looking. */}
      <p aria-live="polite" className="text-sm text-ink-muted">
        {page.total === 0
          ? "No cases match"
          : `${formatCount(page.total)} ${page.total === 1 ? "case" : "cases"}`}
        {filtered ? " with these filters" : ""}
      </p>

      {page.items.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {page.items.map((report, index) => (
              <CaseCard key={report.id} report={report} priority={index < 4} />
            ))}
          </div>

          <Pagination page={page} params={params} />
        </>
      ) : filtered ? (
        <EmptyState
          icon={<SearchX aria-hidden className="size-5" />}
          title="Nothing matches those filters"
          description="Try widening the age range, clearing the city, or searching a shorter part of the name."
          action={
            <ButtonLink href={`/cases?kind=${kind}`} variant="secondary">
              Clear filters
            </ButtonLink>
          }
        />
      ) : (
        <EmptyState
          icon={<UserSearch aria-hidden className="size-5" />}
          title={kind === "missing" ? "No missing-person cases published" : "No found-person cases published"}
          description="Nothing has been reviewed and published in this category yet. Published cases appear here as soon as a reviewer approves them."
          action={
            <ButtonLink href={`/report/${kind}`} variant="secondary">
              {kind === "missing" ? "Report a missing person" : "Report someone found"}
            </ButtonLink>
          }
        />
      )}
    </div>
  );
}

function Pagination({
  page,
  params,
}: {
  page: { total: number; offset: number; limit: number };
  params: SearchParams;
}) {
  const totalPages = Math.ceil(page.total / page.limit);
  if (totalPages <= 1) return null;

  const currentPage = Math.floor(page.offset / page.limit) + 1;

  const linkFor = (pageNumber: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "offset") continue;
      if (typeof value === "string" && value !== "") query.set(key, value);
    }
    const offset = (pageNumber - 1) * page.limit;
    if (offset > 0) query.set("offset", String(offset));
    return `/cases?${query.toString()}`;
  };

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4 border-t border-line pt-6">
      {currentPage > 1 ? (
        <ButtonLink href={linkFor(currentPage - 1)} variant="secondary" size="sm">
          Previous
        </ButtonLink>
      ) : (
        // A disabled span rather than an omitted element, so the "Next" button
        // does not jump across the row when the first page is reached.
        <span aria-hidden className="w-20" />
      )}

      <p className="text-sm text-ink-muted" data-numeric>
        Page {currentPage} of {totalPages}
      </p>

      {currentPage < totalPages ? (
        <ButtonLink href={linkFor(currentPage + 1)} variant="secondary" size="sm">
          Next
        </ButtonLink>
      ) : (
        <span aria-hidden className="w-20" />
      )}
    </nav>
  );
}
