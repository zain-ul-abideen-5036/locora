import { ImageOff, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatAgeRange, formatDate, formatDuration, formatGender } from "@/lib/format";
import type { PublicFoundReport, PublicMissingReport } from "@/server/reports/visibility";

/**
 * One case in a feed.
 *
 * ## The whole card is one link
 *
 * A single `<a>` wrapping the card, rather than a linked title inside a
 * clickable div. It means the entire surface is a real link: middle-click,
 * right-click, "open in new tab" and a screen reader's link list all work, and
 * there is exactly one tab stop per card instead of three.
 *
 * ## Why a missing case is dated and a found case is not
 *
 * A missing card shows how long the person has been missing. That duration is
 * the most important thing on it — it is what makes a viewer understand this is
 * ongoing rather than historical — and it is the field somebody scanning a
 * feed for a face they half-remember will match against.
 *
 * A found card leads with an age range and where they were found, because there
 * is no name to lead with. That asymmetry is the domain, not an inconsistency.
 */

interface CaseCardProps {
  report: PublicMissingReport | PublicFoundReport;
  /** Set on the first few cards in a feed so their photographs are not lazy-loaded. */
  priority?: boolean;
}

export function CaseCard({ report, priority = false }: CaseCardProps) {
  const isMissing = report.kind === "missing";
  const href = `/cases/${report.kind}/${report.id}`;
  const photo = report.photos[0];

  const title = isMissing ? report.fullName : "Unidentified person";
  const city = isMissing ? report.lastSeenCity : report.foundCity;
  const when = isMissing ? report.lastSeenAt : report.foundAt;

  return (
    <Card interactive className="group overflow-hidden p-0">
      <Link href={href} className="block focus-visible:outline-offset-0">
        <div className="relative aspect-4/3 overflow-hidden bg-surface-sunken">
          {photo ? (
            <Image
              src={photo.url}
              // A photograph of a person whose name we may not know. The
              // alternative text says what the image is *of* in the context of
              // this card, which is what a screen-reader user needs — not a
              // description of the photograph, which nobody has written.
              alt={isMissing ? `Photograph of ${report.fullName}` : "Photograph of an unidentified person"}
              fill
              // Matches the grid: one column on mobile, two at sm, three at lg,
              // four at xl. Without accurate sizes the browser downloads a
              // full-width image for a quarter-width slot.
              sizes="(min-width: 1280px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw"
              priority={priority}
              className="object-cover transition-transform duration-500 ease-out-quint group-hover:scale-[1.03]"
            />
          ) : (
            // A deliberate state, not a broken one. Found-person reports often
            // have no photograph by design — publishing a picture of a
            // vulnerable person who has not consented is a decision, and
            // sometimes the right one is not to.
            <div className="flex h-full flex-col items-center justify-center gap-1.5 text-ink-subtle">
              <ImageOff aria-hidden className="size-6" />
              <span className="text-xs">No photograph</span>
            </div>
          )}

          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                "shadow-sm backdrop-blur-sm",
                isMissing ? "bg-missing text-white" : "bg-found text-white",
              )}
            >
              {isMissing ? "Missing" : "Found"}
            </span>
            {report.status === "matched" || report.status === "resolved" ? (
              <StatusBadge status={report.status} className="bg-surface/90 backdrop-blur-sm" />
            ) : null}
          </div>
        </div>

        <div className="space-y-2 p-4">
          <div className="space-y-0.5">
            <h3 className="font-display text-lg font-semibold leading-snug text-ink">
              {/* `line-clamp` rather than truncation with an ellipsis mid-word:
                  a name is worth two lines. */}
              <span className="line-clamp-2">{title}</span>
            </h3>
            <p className="text-sm text-ink-muted">
              {isMissing
                ? `${report.age} years old · ${formatGender(report.gender)}`
                : `${formatAgeRange(report.estimatedAgeMin, report.estimatedAgeMax)} · ${formatGender(report.gender)}`}
            </p>
          </div>

          <p className="flex items-start gap-1.5 text-sm text-ink-muted">
            <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" />
            <span className="line-clamp-1">{city}</span>
          </p>

          <div className="flex items-baseline justify-between gap-2 border-t border-line pt-2">
            <span className="text-xs text-ink-subtle">
              {isMissing ? "Last seen" : "Found"} {formatDate(when)}
            </span>
            {isMissing ? (
              <span className="text-xs font-medium text-missing-fg" data-numeric>
                {formatDuration(when)}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </Card>
  );
}
