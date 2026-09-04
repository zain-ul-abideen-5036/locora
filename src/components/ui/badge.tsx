import { CheckCircle2, CircleDot, Clock, Eye, Link2, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import type { ReportKind, ReportStatus } from "@/db/enums";
import { cn } from "@/lib/cn";
import { formatStatus } from "@/lib/format";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "missing"
  | "found"
  | "positive"
  | "critical"
  | "caution";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "border-line bg-surface-sunken text-ink-muted",
  primary: "border-transparent bg-primary-soft text-primary",
  missing: "border-transparent bg-missing-soft text-missing-fg",
  found: "border-transparent bg-found-soft text-found-fg",
  positive: "border-transparent bg-positive-soft text-positive-fg",
  critical: "border-transparent bg-critical-soft text-critical-fg",
  caution: "border-transparent bg-caution-soft text-caution-fg",
};

export function Badge({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5",
        "text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/**
 * A report's status.
 *
 * Every status carries an icon as well as a colour, and the label is a phrase
 * rather than the raw enum value. Colour alone is not an accessible way to
 * separate "published" from "not published" — and to somebody waiting on news
 * about a relative, those two mean opposite things.
 */
const STATUS_PRESENTATION: Record<ReportStatus, { tone: BadgeTone; Icon: typeof Clock }> = {
  pending: { tone: "neutral", Icon: Clock },
  under_review: { tone: "caution", Icon: Eye },
  published: { tone: "primary", Icon: CircleDot },
  matched: { tone: "found", Icon: Link2 },
  resolved: { tone: "positive", Icon: CheckCircle2 },
  rejected: { tone: "critical", Icon: XCircle },
};

export function StatusBadge({ status, className }: { status: ReportStatus; className?: string }) {
  const { tone, Icon } = STATUS_PRESENTATION[status];
  return (
    <Badge tone={tone} icon={<Icon aria-hidden className="size-3.5" />} className={className}>
      {formatStatus(status)}
    </Badge>
  );
}

/**
 * Which of the two case types this is.
 *
 * The central distinction in the product, so it gets one consistent colour
 * everywhere — amber for a person who is missing, teal for a person who has
 * been found — always with the word beside it.
 */
export function KindBadge({ kind, className }: { kind: ReportKind; className?: string }) {
  return (
    <Badge tone={kind === "missing" ? "missing" : "found"} className={className}>
      {kind === "missing" ? "Missing" : "Found"}
    </Badge>
  );
}
