/**
 * Presentation helpers, shared by server and client.
 *
 * Everything here is a pure function of its input so it can run during a server
 * render and in the browser without a branch. Nothing here reaches for
 * `window`, `Date.now()` at module scope, or a locale that differs between the
 * two — a formatter that disagrees with itself across the boundary produces a
 * hydration mismatch, which React reports as a wall of noise pointing at the
 * wrong place.
 */
import type { Gender, ReportStatus } from "@/db/enums";

/**
 * Escapes text for interpolation into HTML.
 *
 * React escapes everything it renders, so this is not for components. It exists
 * for the one place that builds HTML as a string — the email templates — where
 * an unescaped name containing a `<` would break the markup, and a hostile one
 * could inject a link into a message that appears to come from Locora.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function asDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * A date, formatted identically on the server and in the browser.
 *
 * Pinned to UTC on purpose. The alternative — the viewer's local zone — renders
 * one string during the server pass and possibly a different one on hydration,
 * and "last seen 11pm on the 3rd" silently becoming "1am on the 4th" is a
 * material change of meaning on a missing-person case. Every timestamp shown is
 * therefore the same instant for everyone, and labelled as such where it is
 * shown to the hour.
 */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = asDate(value);
  return date ? DATE_FORMAT.format(date) : "—";
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = asDate(value);
  return date ? `${DATE_TIME_FORMAT.format(date)} UTC` : "—";
}

/**
 * A coarse "how long ago", for list items where the exact instant is noise.
 *
 * Rounded to whole units and never more precise than a day beyond a week —
 * "3 days ago" is what a reader wants from a queue, and "2 days 14 hours" is
 * what nobody asked for.
 */
export function formatRelative(value: Date | string | null | undefined, now = new Date()): string {
  if (!value) return "—";
  const date = asDate(value);
  if (!date) return "—";

  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 0) return formatDate(date);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }
  // Past a month, an absolute date is more useful than an ever-vaguer interval.
  return formatDate(date);
}

/** How long a case has been open, for the urgency signal on a case card. */
export function formatDuration(from: Date | string, now = new Date()): string {
  const start = asDate(from);
  if (!start) return "—";
  const days = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  if (days < 1) return "Today";
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"}`;
}

const GENDER_LABELS: Record<Gender, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  unknown: "Not known",
};

export function formatGender(gender: Gender): string {
  return GENDER_LABELS[gender];
}

const STATUS_LABELS: Record<ReportStatus, string> = {
  pending: "Awaiting review",
  under_review: "In review",
  published: "Published",
  matched: "Possible match",
  resolved: "Resolved",
  rejected: "Not published",
};

export function formatStatus(status: ReportStatus): string {
  return STATUS_LABELS[status];
}

/**
 * What a status means for the reporter, in a sentence.
 *
 * A bare label leaves somebody who has just filed a report about their child
 * guessing what "pending" implies about whether anyone has looked at it.
 */
const STATUS_EXPLANATIONS: Record<ReportStatus, string> = {
  pending: "Submitted. A reviewer will look at this shortly.",
  under_review: "A reviewer is checking the details on this report.",
  published: "Visible on the public case feed.",
  matched: "Linked to another report. A reviewer is confirming whether they are the same person.",
  resolved: "This case is closed.",
  rejected: "This report was not published. See the reviewer's note for why.",
};

export function explainStatus(status: ReportStatus): string {
  return STATUS_EXPLANATIONS[status];
}

/** An estimated-age range, rendered the way it was actually recorded. */
export function formatAgeRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return "Age not known";
  if (min !== null && max !== null) {
    return min === max ? `About ${min}` : `About ${min}–${max}`;
  }
  if (min !== null) return `${min} or older`;
  return `${max} or younger`;
}

export function formatHeight(heightCm: number | null): string {
  if (heightCm === null) return "—";
  const feet = Math.floor(heightCm / 30.48);
  const inches = Math.round((heightCm / 2.54) % 12);
  return `${heightCm}cm (${feet}′${inches}″)`;
}

/** Initials for an avatar placeholder, from whatever name is available. */
export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** `12` → `"12"`, `1234` → `"1,234"`. For counts in the reviewer console. */
export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}
