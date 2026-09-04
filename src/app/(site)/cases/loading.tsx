import { CaseGridSkeleton } from "@/components/ui/feedback";

/**
 * Shown while the feed's data is being fetched.
 *
 * The header and filter bar are reserved at their real heights so nothing moves
 * when the results arrive — the point of a skeleton is that the layout is
 * already settled, not that something is spinning.
 */
export default function CasesLoading() {
  return (
    <div className="container-page py-10 sm:py-14">
      <div className="max-w-2xl space-y-3">
        <div className="h-9 w-56 rounded-md bg-surface-sunken" />
        <div className="h-4 w-full rounded bg-surface-sunken" />
        <div className="h-4 w-3/4 rounded bg-surface-sunken" />
      </div>

      <div className="mt-8 h-11 border-b border-line" />

      <div className="mt-6 space-y-6">
        <div className="h-[7.5rem] rounded-xl border border-line bg-surface" />
        <CaseGridSkeleton />
      </div>
    </div>
  );
}
