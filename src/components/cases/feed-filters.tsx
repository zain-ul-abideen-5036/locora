"use client";

/**
 * The case feed's filter bar.
 *
 * ## A real form, submitted to the URL
 *
 * This is a `<form method="get">` whose fields become query parameters, and the
 * page is a Server Component that reads them. That has consequences worth
 * having: a filtered feed is a shareable link, the Back button steps through
 * previous filters, the page is rendered on the server with the filtered set
 * already in it, and the whole thing works with JavaScript disabled or still
 * downloading.
 *
 * The alternative — holding filters in React state and fetching from an API —
 * would need a loading state, a client-side error state, an effect to keep the
 * URL in sync, and would ship the filtering logic to the browser. All of that
 * to arrive at what a form does natively.
 *
 * JavaScript is used for exactly two things on top: auto-submitting on a
 * select change (so a dropdown does not need a separate button press), and
 * disabling the submit while a navigation is in flight.
 */

import { Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { GENDERS } from "@/db/enums";
import { cn } from "@/lib/cn";
import { formatGender } from "@/lib/format";

export interface FeedFilterValues {
  query?: string | undefined;
  city?: string | undefined;
  gender?: string | undefined;
  minAge?: string | undefined;
  maxAge?: string | undefined;
  sort?: string | undefined;
}

export function FeedFilters({
  values,
  cities,
  kind,
  activeCount,
}: {
  values: FeedFilterValues;
  cities: string[];
  kind: "missing" | "found";
  activeCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  // Advanced filters are collapsed by default on small screens, and opened if
  // any of them is already set — otherwise a shared link with an age range
  // applied would hide the reason the results look narrow.
  const [expanded, setExpanded] = useState(
    Boolean(values.gender || values.minAge || values.maxAge),
  );

  /** Navigates to the same path with the form's current values as the query string. */
  function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    const next = new URLSearchParams();

    for (const [key, value] of data.entries()) {
      if (typeof value === "string" && value.trim() !== "") next.set(key, value.trim());
    }
    // The kind is part of the tab, not the filter form, so it is preserved
    // rather than read from the fields.
    next.set("kind", kind);

    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  const hasFilters = activeCount > 0;

  return (
    <form
      ref={formRef}
      method="get"
      onSubmit={(event) => {
        event.preventDefault();
        submit(event.currentTarget);
      }}
      className="rounded-xl border border-line bg-surface p-4"
    >
      {/* Preserved across submits so switching a filter does not silently move
          the visitor back to the other tab. */}
      <input type="hidden" name="kind" value={kind} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
          />
          <Input
            type="search"
            name="query"
            defaultValue={values.query ?? ""}
            placeholder={
              kind === "missing"
                ? "Search by name or description"
                : "Search descriptions and notes"
            }
            aria-label={kind === "missing" ? "Search by name or description" : "Search descriptions"}
            className="pl-9"
          />
        </div>

        <div className="sm:w-52">
          <Select
            name="city"
            defaultValue={values.city ?? ""}
            aria-label="City"
            // A change navigates immediately: a dropdown that requires a
            // separate button press afterwards is a dropdown people think is
            // broken.
            onChange={() => formRef.current && submit(formRef.current)}
          >
            <option value="">Any city</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </Select>
        </div>

        <Button type="submit" loading={pending} loadingLabel="Searching" className="sm:w-auto">
          Search
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-controls="advanced-filters"
          // min-h-8 with its own padding: as a bare inline-flex this was 20px
          // tall, which is below the size at which a control is reliably
          // tappable. The negative margin keeps it optically aligned with the
          // row despite the added padding.
          className="-mx-1.5 inline-flex min-h-8 items-center gap-1.5 rounded-md px-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
        >
          <SlidersHorizontal aria-hidden className="size-3.5" />
          More filters
        </button>

        {hasFilters ? (
          <Link
            // A plain link back to the unfiltered feed, keeping the tab. Cheaper
            // and more predictable than clearing every field by hand.
            href={`${pathname}?kind=${kind}`}
            // Sized as a control rather than as inline text: it sits in a row
            // of controls and is tapped deliberately.
            className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-sm text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
          >
            <X aria-hidden className="size-3.5" />
            Clear {activeCount} {activeCount === 1 ? "filter" : "filters"}
          </Link>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="sort" className="text-sm text-ink-muted">
            Sort
          </label>
          <Select
            id="sort"
            name="sort"
            defaultValue={values.sort ?? "newest"}
            onChange={() => formRef.current && submit(formRef.current)}
            className="h-9 w-auto text-sm"
          >
            <option value="newest">Newest reports</option>
            <option value="oldest">Oldest reports</option>
            <option value="recently_seen">
              {kind === "missing" ? "Most recently seen" : "Most recently found"}
            </option>
          </Select>
        </div>
      </div>

      <div
        id="advanced-filters"
        // `hidden` rather than conditional rendering, so the inputs stay in the
        // form and keep their values while collapsed.
        hidden={!expanded}
        className={cn("mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-3")}
      >
        <div className="space-y-1.5">
          <label htmlFor="gender" className="block text-sm font-medium text-ink">
            Gender
          </label>
          <Select id="gender" name="gender" defaultValue={values.gender ?? ""}>
            <option value="">Any</option>
            {GENDERS.map((gender) => (
              <option key={gender} value={gender}>
                {formatGender(gender)}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="minAge" className="block text-sm font-medium text-ink">
            Youngest age
          </label>
          <Input
            id="minAge"
            name="minAge"
            type="number"
            inputMode="numeric"
            min={0}
            max={130}
            defaultValue={values.minAge ?? ""}
            placeholder="0"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="maxAge" className="block text-sm font-medium text-ink">
            Oldest age
          </label>
          <Input
            id="maxAge"
            name="maxAge"
            type="number"
            inputMode="numeric"
            min={0}
            max={130}
            defaultValue={values.maxAge ?? ""}
            placeholder="130"
          />
        </div>
      </div>
    </form>
  );
}
