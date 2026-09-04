/**
 * Who may see a report, and which fields of it.
 *
 * This is the file to read first when reviewing Locora's privacy behaviour.
 * Every read path — the public feed, a case page, the reviewer console, the
 * JSON API — goes through the projections here, and nothing else decides
 * visibility.
 *
 * ## Two independent questions
 *
 * They are separate on purpose, because conflating them is how data leaks:
 *
 * 1. **May this viewer see the report at all?** (`canViewReport`) A report that
 *    is awaiting review, or was rejected, is not public. Its id is an
 *    unguessable UUID, but "unguessable" is not an access control — a link
 *    pasted into a group chat, a browser history on a shared computer, or a
 *    referrer header is enough to hand it to someone. A rejected report in
 *    particular may have been rejected *because* its content was abusive, and
 *    it must stop being readable the moment that decision is made.
 *
 * 2. **Which fields may they see?** (`toPublicMissing` vs `toOwnerMissing`) A
 *    published case is meant to be seen by strangers — that is how somebody
 *    recognises a face — but its contact telephone number is not.
 *
 * ## Why projections are written out by hand
 *
 * Each function names every field it returns. It would be shorter to spread the
 * row and delete the sensitive keys, and that shortcut is exactly the bug: the
 * next column added to the schema would be published by default, and the
 * mistake would be invisible in review because the diff that causes it is in a
 * different file. Here, a new column appears in an API response only when
 * somebody writes the line that puts it there.
 */
import type { Gender, ReportStatus } from "@/db/enums";
import type { CurrentUser } from "@/server/auth/current-user";
import { notFound } from "@/server/http/errors";

/** `null` for an anonymous visitor. */
export type Viewer = CurrentUser | null;

/** Statuses a stranger may see. Everything else is owner-and-reviewer only. */
const PUBLICLY_VISIBLE_STATUSES: ReadonlySet<ReportStatus> = new Set<ReportStatus>([
  "published",
  "matched",
  "resolved",
]);

export function isPubliclyVisible(status: ReportStatus): boolean {
  return PUBLICLY_VISIBLE_STATUSES.has(status);
}

export function isOwner(ownerId: string, viewer: Viewer): boolean {
  return viewer !== null && viewer.id === ownerId;
}

export function isReviewer(viewer: Viewer): boolean {
  return viewer?.role === "admin";
}

/** True when the viewer is entitled to the contact details and reviewer notes. */
export function canViewOwnerDetails(ownerId: string, viewer: Viewer): boolean {
  return isOwner(ownerId, viewer) || isReviewer(viewer);
}

export function canViewReport(
  report: { reporterId: string; status: ReportStatus },
  viewer: Viewer,
): boolean {
  if (isPubliclyVisible(report.status)) return true;
  return canViewOwnerDetails(report.reporterId, viewer);
}

/**
 * Enforces `canViewReport`, as a 404 rather than a 403.
 *
 * The status code is the point. A 403 confirms that a report with this id
 * exists, which is itself information about a case somebody was not permitted
 * to see. A 404 is indistinguishable from an id that was never real.
 */
export function assertCanViewReport(
  report: { reporterId: string; status: ReportStatus },
  viewer: Viewer,
): void {
  if (!canViewReport(report, viewer)) throw notFound("That case could not be found.");
}

// ---------------------------------------------------------------------------
// The shapes that cross the wire
// ---------------------------------------------------------------------------

export interface PhotoView {
  id: string;
  url: string;
}

export interface ReporterView {
  /** A display name only. Never the reporter's email address or telephone number —
   *  those belong to the account, not to the case. */
  displayName: string | null;
}

interface ReportBase {
  id: string;
  status: ReportStatus;
  gender: Gender;
  heightCm: number | null;
  distinguishingFeatures: string | null;
  photos: PhotoView[];
  reporter: ReporterView;
  createdAt: string;
  updatedAt: string;
  /** Whether this viewer may act on the report, so the UI does not have to re-derive it. */
  viewerIsOwner: boolean;
  viewerIsReviewer: boolean;
}

export interface PublicMissingReport extends ReportBase {
  kind: "missing";
  fullName: string;
  age: number;
  clothingDescription: string | null;
  lastSeenAddress: string;
  lastSeenCity: string;
  lastSeenLatitude: number | null;
  lastSeenLongitude: number | null;
  lastSeenAt: string;
}

export interface OwnerMissingReport extends PublicMissingReport {
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  policeReportNumber: string | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
}

export interface PublicFoundReport extends ReportBase {
  kind: "found";
  estimatedAgeMin: number | null;
  estimatedAgeMax: number | null;
  notes: string | null;
  foundAddress: string;
  foundCity: string;
  foundLatitude: number | null;
  foundLongitude: number | null;
  foundAt: string;
}

export interface OwnerFoundReport extends PublicFoundReport {
  /** The single most sensitive field in the product — see src/db/schema.ts. */
  currentWhereabouts: string | null;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
}

export type MissingReportView = PublicMissingReport | OwnerMissingReport;
export type FoundReportView = PublicFoundReport | OwnerFoundReport;
export type ReportView = MissingReportView | FoundReportView;

/** Narrowing helper, so a component can ask rather than inspect keys. */
export function hasOwnerDetails(
  view: MissingReportView,
): view is OwnerMissingReport;
export function hasOwnerDetails(view: FoundReportView): view is OwnerFoundReport;
export function hasOwnerDetails(view: ReportView): boolean {
  return "contactPhone" in view;
}

// ---------------------------------------------------------------------------
// Row shapes this module accepts
// ---------------------------------------------------------------------------

/**
 * The database columns a projection reads.
 *
 * Declared as an interface rather than reusing `typeof missingPersonReports.$inferSelect`
 * so that a query is free to select only the columns it needs — the feed does
 * not fetch contact details at all, which means those bytes never leave
 * Postgres on a public request, let alone the process.
 */
export interface MissingRow {
  id: string;
  reporterId: string;
  fullName: string;
  age: number;
  gender: Gender;
  heightCm: number | null;
  clothingDescription: string | null;
  distinguishingFeatures: string | null;
  lastSeenAddress: string;
  lastSeenCity: string;
  lastSeenLatitude: number | null;
  lastSeenLongitude: number | null;
  lastSeenAt: Date;
  status: ReportStatus;
  createdAt: Date;
  updatedAt: Date;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string | null;
  policeReportNumber?: string | null;
  reviewNotes?: string | null;
  reviewedAt?: Date | null;
}

export interface FoundRow {
  id: string;
  reporterId: string;
  estimatedAgeMin: number | null;
  estimatedAgeMax: number | null;
  gender: Gender;
  heightCm: number | null;
  distinguishingFeatures: string | null;
  notes: string | null;
  foundAddress: string;
  foundCity: string;
  foundLatitude: number | null;
  foundLongitude: number | null;
  foundAt: Date;
  status: ReportStatus;
  createdAt: Date;
  updatedAt: Date;
  currentWhereabouts?: string | null;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string | null;
  reviewNotes?: string | null;
  reviewedAt?: Date | null;
}

export interface ReporterRow {
  fullName: string | null;
}

export interface PhotoRow {
  id: string;
  blobUrl: string;
}

function baseOf(
  row: { id: string; reporterId: string; status: ReportStatus; gender: Gender; heightCm: number | null; distinguishingFeatures: string | null; createdAt: Date; updatedAt: Date },
  reporter: ReporterRow | null,
  photos: PhotoRow[],
  viewer: Viewer,
): ReportBase {
  return {
    id: row.id,
    status: row.status,
    gender: row.gender,
    heightCm: row.heightCm,
    distinguishingFeatures: row.distinguishingFeatures,
    photos: photos.map((photo) => ({ id: photo.id, url: photo.blobUrl })),
    reporter: { displayName: reporter?.fullName ?? null },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    viewerIsOwner: isOwner(row.reporterId, viewer),
    viewerIsReviewer: isReviewer(viewer),
  };
}

export function toPublicMissing(
  row: MissingRow,
  reporter: ReporterRow | null,
  photos: PhotoRow[],
  viewer: Viewer,
): PublicMissingReport {
  return {
    ...baseOf(row, reporter, photos, viewer),
    kind: "missing",
    fullName: row.fullName,
    age: row.age,
    clothingDescription: row.clothingDescription,
    lastSeenAddress: row.lastSeenAddress,
    lastSeenCity: row.lastSeenCity,
    lastSeenLatitude: row.lastSeenLatitude,
    lastSeenLongitude: row.lastSeenLongitude,
    lastSeenAt: row.lastSeenAt.toISOString(),
  };
}

export function toOwnerMissing(
  row: MissingRow,
  reporter: ReporterRow | null,
  photos: PhotoRow[],
  viewer: Viewer,
): OwnerMissingReport {
  return {
    ...toPublicMissing(row, reporter, photos, viewer),
    contactName: row.contactName ?? "",
    contactPhone: row.contactPhone ?? "",
    contactEmail: row.contactEmail ?? null,
    policeReportNumber: row.policeReportNumber ?? null,
    reviewNotes: row.reviewNotes ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

export function toPublicFound(
  row: FoundRow,
  reporter: ReporterRow | null,
  photos: PhotoRow[],
  viewer: Viewer,
): PublicFoundReport {
  return {
    ...baseOf(row, reporter, photos, viewer),
    kind: "found",
    estimatedAgeMin: row.estimatedAgeMin,
    estimatedAgeMax: row.estimatedAgeMax,
    notes: row.notes,
    foundAddress: row.foundAddress,
    foundCity: row.foundCity,
    foundLatitude: row.foundLatitude,
    foundLongitude: row.foundLongitude,
    foundAt: row.foundAt.toISOString(),
  };
}

export function toOwnerFound(
  row: FoundRow,
  reporter: ReporterRow | null,
  photos: PhotoRow[],
  viewer: Viewer,
): OwnerFoundReport {
  return {
    ...toPublicFound(row, reporter, photos, viewer),
    currentWhereabouts: row.currentWhereabouts ?? null,
    contactName: row.contactName ?? "",
    contactPhone: row.contactPhone ?? "",
    contactEmail: row.contactEmail ?? null,
    reviewNotes: row.reviewNotes ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

/**
 * Chooses the projection for this viewer.
 *
 * The single entry point every case read should use, so the choice is made in
 * one place instead of being repeated — and occasionally forgotten — per route.
 */
export function projectMissing(
  row: MissingRow,
  reporter: ReporterRow | null,
  photos: PhotoRow[],
  viewer: Viewer,
): MissingReportView {
  return canViewOwnerDetails(row.reporterId, viewer)
    ? toOwnerMissing(row, reporter, photos, viewer)
    : toPublicMissing(row, reporter, photos, viewer);
}

export function projectFound(
  row: FoundRow,
  reporter: ReporterRow | null,
  photos: PhotoRow[],
  viewer: Viewer,
): FoundReportView {
  return canViewOwnerDetails(row.reporterId, viewer)
    ? toOwnerFound(row, reporter, photos, viewer)
    : toPublicFound(row, reporter, photos, viewer);
}
