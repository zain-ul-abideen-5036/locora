/**
 * Enumerated domain values, declared once and shared by the database schema,
 * the validation layer and the UI.
 *
 * These are real Postgres enum types rather than free-text columns, so an
 * invalid value is rejected by the database and not only by application code.
 *
 * Every member below is the literal string that is stored. That is worth
 * stating explicitly, because the equivalent Python/SQLAlchemy schema this
 * product's design derives from had a long-lived bug where the enum's *name*
 * (`USER`) was written to a column whose type only accepted its *value*
 * (`user`), breaking every insert. Declaring the stored strings directly, and
 * deriving the TypeScript union from them, makes that class of mismatch
 * unrepresentable.
 */
import { pgEnum } from "drizzle-orm/pg-core";

export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRoleEnum = pgEnum("user_role", USER_ROLES);

export const GENDERS = ["male", "female", "other", "unknown"] as const;
export type Gender = (typeof GENDERS)[number];
export const genderEnum = pgEnum("gender", GENDERS);

/**
 * The lifecycle of both missing- and found-person reports.
 *
 *   pending       just submitted, awaiting moderation
 *   under_review  a reviewer is actively verifying the details
 *   published     visible on the public case feed
 *   matched       linked to a counterpart report, awaiting confirmation
 *   resolved      case closed — person reunited or identified
 *   rejected      removed by a reviewer (fabricated, duplicate, abusive)
 *
 * Legal transitions live in src/server/reports/status.ts, not here: the
 * database can enforce which values exist, but not which order they may occur in.
 */
export const REPORT_STATUSES = [
  "pending",
  "under_review",
  "published",
  "matched",
  "resolved",
  "rejected",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const reportStatusEnum = pgEnum("report_status", REPORT_STATUSES);

export const MATCH_STATUSES = ["possible", "confirmed", "dismissed"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];
export const matchStatusEnum = pgEnum("match_status", MATCH_STATUSES);

/**
 * How a match came to exist.
 *
 * Kept separate from the match's status so that when assisted matching is
 * eventually built, machine-suggested links can be filtered and audited apart
 * from human-created ones with no schema change. Nothing writes `automated`
 * today.
 */
export const MATCH_SOURCES = ["manual_review", "automated"] as const;
export type MatchSource = (typeof MATCH_SOURCES)[number];
export const matchSourceEnum = pgEnum("match_source", MATCH_SOURCES);

export const NOTIFICATION_TYPES = [
  "report_status_changed",
  "possible_match_found",
  "match_confirmed",
  "match_dismissed",
  "account_security",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export const notificationTypeEnum = pgEnum("notification_type", NOTIFICATION_TYPES);

export const ABUSE_REASONS = [
  "fabricated_report",
  "inappropriate_content",
  "spam",
  "privacy_concern",
  "other",
] as const;
export type AbuseReason = (typeof ABUSE_REASONS)[number];
export const abuseReasonEnum = pgEnum("abuse_reason", ABUSE_REASONS);

/** The two kinds of case, used wherever a reference has to say which table it points at. */
export const REPORT_KINDS = ["missing", "found"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
