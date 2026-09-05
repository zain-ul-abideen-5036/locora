"use client";

/**
 * Search, status filter and ordering for the review queue.
 *
 * A GET form writing to the URL, for the same reasons as the public feed: a
 * filtered queue is a link a reviewer can send to a colleague ("can you look at
 * these"), the Back button steps through what they were just looking at, and
 * the page arrives already filtered rather than flashing an unfiltered list.
 *
 * ## On bulk actions
 *
 * There are none here, and that is a decision rather than an omission. The
 * brief for this console asks for bulk actions "only where genuinely safe", and
 * on this queue none of them are: publishing means a photograph of a named
 * person becomes visible to strangers, and declining sends somebody a written
 * reason about a report on their missing relative. Both are per-case judgements,
 * and a "select all → publish" would be a button whose entire purpose is to skip
 * the review this product exists to perform. What actually makes a queue fast is
 * not acting on ten cases at once — it is not having to open ten tabs, which is
 * what the search, the ordering and the on-row detail below are for.
 */

import { ArrowDownWideNarrow, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export interface QueueControlValues {
  kind: "missing" | "found";
  search: string | undefined;
  status: "waiting" | "pending" | "under_review";
  order: "oldest" | "newest";
}

export function QueueControls({
  values,
  resultCount,
}: {
  values: QueueControlValues;
  resultCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    const next = new URLSearchParams();

    for (const [key, value] of data.entries()) {
      if (typeof value === "string" && value.trim() !== "") next.set(key, value.trim());
    }
    next.set("kind", values.kind);

    startTransition(() => {
      // `scroll: false` so a reviewer working down a long queue is not thrown
      // back to the top every time they change a filter.
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  const filtered = Boolean(values.search) || values.status !== "waiting" || values.order !== "oldest";

  return (
    <form
      ref={formRef}
      method="get"
      onSubmit={(event) => {
        event.preventDefault();
        submit(event.currentTarget);
      }}
      className="rounded-xl border border-line bg-surface p-3"
    >
      <input type="hidden" name="kind" value={values.kind} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
          />
          <Input
            type="search"
            name="q"
            defaultValue={values.search ?? ""}
            aria-label={
              values.kind === "missing"
                ? "Search the queue by name or city"
                : "Search the queue by city"
            }
            placeholder={
              values.kind === "missing" ? "Search by name or city" : "Search by city"
            }
            className="h-9 pl-9"
          />
        </div>

        <Select
          name="status"
          defaultValue={values.status}
          aria-label="Filter by status"
          onChange={() => formRef.current && submit(formRef.current)}
          // Wide enough for the longest option. A native select clips rather
          // than wrapping, so a too-narrow one silently truncates its own label.
          className="h-9 sm:w-48"
        >
          <option value="waiting">Everything waiting</option>
          <option value="pending">Not yet opened</option>
          <option value="under_review">Being checked</option>
        </Select>

        <Select
          name="order"
          defaultValue={values.order}
          aria-label="Order"
          onChange={() => formRef.current && submit(formRef.current)}
          className="h-9 sm:w-52"
        >
          <option value="oldest">Longest waiting first</option>
          <option value="newest">Newest first</option>
        </Select>

        <Button type="submit" size="sm" loading={pending} loadingLabel="Searching" className="h-9">
          Search
        </Button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-3 border-t border-line pt-2.5">
        {/* Announced, so a reviewer using a screen reader is told the count
            changed rather than having to go and check. */}
        <p aria-live="polite" className="text-xs text-ink-muted">
          {resultCount === 0
            ? "Nothing matches"
            : `${resultCount} ${resultCount === 1 ? "report" : "reports"} on this page`}
        </p>

        {values.order === "newest" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-caution-soft px-2 py-0.5 text-2xs font-medium text-caution-fg">
            <ArrowDownWideNarrow aria-hidden className="size-3" />
            Newest first — the longest-waiting case is not at the top
          </span>
        ) : null}

        {filtered ? (
          <Link
            href={`${pathname}?kind=${values.kind}`}
            className={cn(
              "ml-auto inline-flex items-center gap-1 text-xs text-accent",
              "underline decoration-line-strong underline-offset-4 hover:decoration-accent",
            )}
          >
            <X aria-hidden className="size-3" />
            Reset
          </Link>
        ) : null}
      </div>
    </form>
  );
}
