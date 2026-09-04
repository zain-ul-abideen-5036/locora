/**
 * Report writes: filing, photographs, and reviewer decisions.
 *
 * Everything that changes a report goes through here, and every function starts
 * by establishing who the caller is entitled to be. There is no "internal"
 * variant that skips the check — a second door is how the first one stops being
 * load-bearing.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import type { ReportKind, ReportStatus } from "@/db/enums";
import {
  abuseReports,
  foundPersonReports,
  missingPersonReports,
  reportPhotos,
} from "@/db/schema";
import type { FoundReportInput, MissingReportInput } from "@/lib/validation/reports";
import { recordAudit } from "@/server/admin/audit";
import type { CurrentUser } from "@/server/auth/current-user";
import { badRequest, conflict, forbidden, notFound, payloadTooLarge } from "@/server/http/errors";
import { notify } from "@/server/notifications/service";
import { logger } from "@/server/observability/logger";
import { deleteStoredPhotos, storeReportPhoto } from "@/server/storage/blob";
import {
  MAX_PHOTOS_PER_REPORT,
  MAX_UPLOAD_REQUEST_BYTES,
  validateImage,
} from "@/server/storage/images";

import { findFoundById, findMissingById } from "./queries";
import { assertReviewNotes, assertTransition, shouldNotifyReporter } from "./status";
import {
  assertCanViewReport,
  type FoundReportView,
  type MissingReportView,
  type Viewer,
} from "./visibility";

// ---------------------------------------------------------------------------
// Reads that enforce visibility
// ---------------------------------------------------------------------------

/**
 * A case, or a 404 — whether because it does not exist or because this viewer
 * may not see it. The two are indistinguishable on purpose; see
 * `assertCanViewReport`.
 */
export async function getMissingReport(
  reportId: string,
  viewer: Viewer,
): Promise<MissingReportView> {
  const found = await findMissingById(reportId, viewer);
  if (!found) throw notFound("That case could not be found.");
  assertCanViewReport(found, viewer);
  return found.view;
}

export async function getFoundReport(reportId: string, viewer: Viewer): Promise<FoundReportView> {
  const found = await findFoundById(reportId, viewer);
  if (!found) throw notFound("That case could not be found.");
  assertCanViewReport(found, viewer);
  return found.view;
}

// ---------------------------------------------------------------------------
// Filing a report
// ---------------------------------------------------------------------------

export async function createMissingReport(
  reporter: CurrentUser,
  input: MissingReportInput,
): Promise<{ id: string }> {
  const [row] = await getDb()
    .insert(missingPersonReports)
    .values({
      reporterId: reporter.id,
      fullName: input.fullName,
      age: input.age,
      gender: input.gender,
      heightCm: input.heightCm,
      clothingDescription: input.clothingDescription,
      distinguishingFeatures: input.distinguishingFeatures,
      lastSeenAddress: input.lastSeenAddress,
      lastSeenCity: input.lastSeenCity,
      lastSeenLatitude: input.latitude,
      lastSeenLongitude: input.longitude,
      lastSeenAt: input.lastSeenAt,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      policeReportNumber: input.policeReportNumber,
      // Never taken from the request. A report enters the queue and a person
      // decides whether it is published.
      status: "pending",
    })
    .returning({ id: missingPersonReports.id });

  if (!row) throw new Error("Insert returned no row");

  logger.info("Missing-person report filed", { reportId: row.id, city: input.lastSeenCity });
  return { id: row.id };
}

export async function createFoundReport(
  reporter: CurrentUser,
  input: FoundReportInput,
): Promise<{ id: string }> {
  const [row] = await getDb()
    .insert(foundPersonReports)
    .values({
      reporterId: reporter.id,
      estimatedAgeMin: input.estimatedAgeMin,
      estimatedAgeMax: input.estimatedAgeMax,
      gender: input.gender,
      heightCm: input.heightCm,
      distinguishingFeatures: input.distinguishingFeatures,
      notes: input.notes,
      foundAddress: input.foundAddress,
      foundCity: input.foundCity,
      foundLatitude: input.latitude,
      foundLongitude: input.longitude,
      foundAt: input.foundAt,
      currentWhereabouts: input.currentWhereabouts,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      status: "pending",
    })
    .returning({ id: foundPersonReports.id });

  if (!row) throw new Error("Insert returned no row");

  logger.info("Found-person report filed", { reportId: row.id, city: input.foundCity });
  return { id: row.id };
}

// ---------------------------------------------------------------------------
// Photographs
// ---------------------------------------------------------------------------

interface OwnedReport {
  id: string;
  reporterId: string;
  status: ReportStatus;
}

async function loadOwnedReport(kind: ReportKind, reportId: string): Promise<OwnedReport> {
  const db = getDb();
  if (kind === "missing") {
    const [row] = await db
      .select({
        id: missingPersonReports.id,
        reporterId: missingPersonReports.reporterId,
        status: missingPersonReports.status,
      })
      .from(missingPersonReports)
      .where(eq(missingPersonReports.id, reportId))
      .limit(1);
    if (!row) throw notFound("That case could not be found.");
    return row;
  }

  const [row] = await db
    .select({
      id: foundPersonReports.id,
      reporterId: foundPersonReports.reporterId,
      status: foundPersonReports.status,
    })
    .from(foundPersonReports)
    .where(eq(foundPersonReports.id, reportId))
    .limit(1);
  if (!row) throw notFound("That case could not be found.");
  return row;
}

function assertCanEdit(report: OwnedReport, user: CurrentUser): void {
  if (report.reporterId === user.id || user.role === "admin") return;
  // A 404 rather than a 403, for the same reason as reading: a 403 confirms
  // that a case with this id exists.
  throw notFound("That case could not be found.");
}

export interface IncomingFile {
  data: Buffer;
  declaredType: string | null;
}

export interface UploadOutcome {
  added: number;
  /** Per-file refusals, so the UI can say which photograph was rejected and why. */
  rejected: { index: number; reason: string }[];
}

/**
 * Attaches photographs to a report.
 *
 * The count check spans photographs already attached, not just the ones in this
 * request. A per-request cap is not a cap at all: five, then five more, then
 * five more satisfies it every time and attaches fifteen.
 *
 * A partial success is a success. If four of five files are valid, the four are
 * stored and the fifth is reported — refusing all five because one was a HEIC
 * would make somebody re-pick every file.
 */
export async function addPhotos(
  kind: ReportKind,
  reportId: string,
  user: CurrentUser,
  files: IncomingFile[],
): Promise<UploadOutcome> {
  if (files.length === 0) throw badRequest("No photographs were attached.");

  const report = await loadOwnedReport(kind, reportId);
  assertCanEdit(report, user);

  if (report.status === "resolved") {
    throw conflict("This case is resolved, so its photographs can no longer be changed.");
  }

  const totalBytes = files.reduce((sum, file) => sum + file.data.length, 0);
  if (totalBytes > MAX_UPLOAD_REQUEST_BYTES) {
    throw payloadTooLarge(
      `That is more than ${Math.floor(MAX_UPLOAD_REQUEST_BYTES / (1024 * 1024))}MB in one go. Upload a few at a time.`,
    );
  }

  const db = getDb();
  const parentColumn =
    kind === "missing" ? reportPhotos.missingReportId : reportPhotos.foundReportId;

  const [existing] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reportPhotos)
    .where(eq(parentColumn, reportId));
  const existingCount = existing?.count ?? 0;

  if (existingCount >= MAX_PHOTOS_PER_REPORT) {
    throw conflict(
      `This case already has the maximum of ${MAX_PHOTOS_PER_REPORT} photographs. Remove one first.`,
    );
  }

  const remaining = MAX_PHOTOS_PER_REPORT - existingCount;
  const outcome: UploadOutcome = { added: 0, rejected: [] };

  for (const [index, file] of files.entries()) {
    if (outcome.added >= remaining) {
      outcome.rejected.push({
        index,
        reason: `Not added — a case can hold ${MAX_PHOTOS_PER_REPORT} photographs.`,
      });
      continue;
    }

    const validation = validateImage(file.data, file.declaredType);
    if (!validation.ok) {
      outcome.rejected.push({ index, reason: validation.reason });
      continue;
    }

    const stored = await storeReportPhoto(
      reportId,
      file.data,
      validation.contentType,
      validation.extension,
    );

    await db.insert(reportPhotos).values({
      missingReportId: kind === "missing" ? reportId : null,
      foundReportId: kind === "found" ? reportId : null,
      blobUrl: stored.url,
      blobPathname: stored.pathname,
      contentType: stored.contentType,
      byteSize: stored.byteSize,
      sortOrder: existingCount + outcome.added,
    });

    outcome.added += 1;
  }

  if (outcome.added === 0 && outcome.rejected.length > 0) {
    // Nothing was stored, so this is a failed request rather than a partial
    // one. Surface the first reason — the UI shows the rest from `rejected`.
    throw badRequest(outcome.rejected[0]?.reason ?? "That photograph could not be added.");
  }

  return outcome;
}

/** Removes one photograph, from storage as well as from the database. */
export async function removePhoto(
  kind: ReportKind,
  reportId: string,
  photoId: string,
  user: CurrentUser,
): Promise<void> {
  const report = await loadOwnedReport(kind, reportId);
  assertCanEdit(report, user);

  const db = getDb();
  const parentColumn =
    kind === "missing" ? reportPhotos.missingReportId : reportPhotos.foundReportId;

  const [photo] = await db
    .select({ id: reportPhotos.id, blobUrl: reportPhotos.blobUrl })
    .from(reportPhotos)
    .where(and(eq(reportPhotos.id, photoId), eq(parentColumn, reportId)))
    .limit(1);

  if (!photo) throw notFound("That photograph could not be found.");

  // The database row goes first. If the order were reversed and the delete
  // failed, the row would point at an object that no longer exists and the case
  // page would render a broken image. This way the worst case is an orphaned
  // object in the store, which nothing links to.
  await db.delete(reportPhotos).where(eq(reportPhotos.id, photo.id));
  await deleteStoredPhotos([photo.blobUrl]);
}

// ---------------------------------------------------------------------------
// Reviewer decisions
// ---------------------------------------------------------------------------

export interface ReviewDecision {
  status: ReportStatus;
  reviewNotes: string | null;
}

/**
 * Moves a report through the status machine under a reviewer's authority.
 *
 * The status change, the audit entry and the reporter's notification are one
 * transaction. A published case with no audit entry is an accountability gap,
 * and a rejected case whose reporter was never told is a family refreshing a
 * page waiting for news that already came and went.
 */
export async function reviewReport(
  kind: ReportKind,
  reportId: string,
  reviewer: CurrentUser,
  decision: ReviewDecision,
): Promise<{ status: ReportStatus }> {
  const report = await loadOwnedReport(kind, reportId);

  assertTransition(report.status, decision.status);
  assertReviewNotes(decision.status, decision.reviewNotes);

  const table = kind === "missing" ? missingPersonReports : foundPersonReports;
  const label = kind === "missing" ? "missing-person" : "found-person";
  const href = `/cases/${kind}/${reportId}`;

  await getDb().transaction(async (tx) => {
    await tx
      .update(table)
      .set({
        status: decision.status,
        // Only overwritten when a note was supplied, so publishing a case does
        // not silently erase the note explaining an earlier rejection.
        ...(decision.reviewNotes !== null ? { reviewNotes: decision.reviewNotes } : {}),
        reviewedAt: new Date(),
        reviewedBy: reviewer.id,
        updatedAt: new Date(),
      })
      .where(eq(table.id, reportId));

    await recordAudit(tx, {
      actor: reviewer,
      action: "report.status_changed",
      targetType: kind === "missing" ? "missing_report" : "found_report",
      targetId: reportId,
      metadata: { from: report.status, to: decision.status },
    });

    if (shouldNotifyReporter(decision.status)) {
      await notify(tx, {
        userId: report.reporterId,
        type: "report_status_changed",
        title: notificationTitle(decision.status, label),
        body: notificationBody(decision.status, decision.reviewNotes),
        href,
      });
    }
  });

  logger.info("Report status changed", {
    reportId,
    kind,
    from: report.status,
    to: decision.status,
  });

  return { status: decision.status };
}

function notificationTitle(status: ReportStatus, label: string): string {
  switch (status) {
    case "published":
      return `Your ${label} report is now live`;
    case "rejected":
      return `Your ${label} report was not published`;
    case "resolved":
      return `Your ${label} case has been closed`;
    default:
      return `Your ${label} report was updated`;
  }
}

function notificationBody(status: ReportStatus, reviewNotes: string | null): string {
  switch (status) {
    case "published":
      return "It is visible on the public case feed and can now be seen by anyone who might recognise them.";
    case "rejected":
      return reviewNotes
        ? `A reviewer left this note: ${reviewNotes}`
        : "A reviewer decided not to publish this report.";
    case "resolved":
      return "The case has been marked resolved and has been removed from the public feed.";
    default:
      return "Open the case to see the current status.";
  }
}

// ---------------------------------------------------------------------------
// Flagging a case
// ---------------------------------------------------------------------------

export interface AbuseReportInput {
  missingReportId: string | null;
  foundReportId: string | null;
  reason: "fabricated_report" | "inappropriate_content" | "spam" | "privacy_concern" | "other";
  details: string | null;
}

/**
 * Files an abuse flag against a case.
 *
 * The target is resolved before the insert. Passing an id that does not exist
 * would otherwise reach Postgres and come back as a foreign-key violation — a
 * 500 with a stack trace, where the honest answer is a 404.
 */
export async function fileAbuseReport(
  user: CurrentUser,
  input: AbuseReportInput,
): Promise<{ id: string }> {
  const kind: ReportKind = input.missingReportId ? "missing" : "found";
  const targetId = input.missingReportId ?? input.foundReportId;
  if (!targetId) throw badRequest("A flag must name exactly one case.");

  const target = await loadOwnedReport(kind, targetId);

  // Flagging your own report is not abuse reporting; it is a way to summon a
  // reviewer, and there are proper channels for that.
  if (target.reporterId === user.id) {
    throw forbidden("This is your own report. Contact us instead if you need it removed.");
  }

  const db = getDb();

  const [existing] = await db
    .select({ id: abuseReports.id })
    .from(abuseReports)
    .where(
      and(
        eq(abuseReports.filedById, user.id),
        input.missingReportId
          ? eq(abuseReports.missingReportId, input.missingReportId)
          : eq(abuseReports.foundReportId, input.foundReportId as string),
        isNull(abuseReports.resolvedAt),
      ),
    )
    .limit(1);

  if (existing) {
    // The database has a matching partial unique index; this turns the common
    // case into a clear message instead of a constraint violation.
    throw conflict("You have already flagged this case. A reviewer will look at it.");
  }

  const [row] = await db
    .insert(abuseReports)
    .values({
      filedById: user.id,
      missingReportId: input.missingReportId,
      foundReportId: input.foundReportId,
      reason: input.reason,
      details: input.details,
    })
    .returning({ id: abuseReports.id });

  if (!row) throw new Error("Insert returned no row");
  logger.info("Case flagged", { reason: input.reason, kind });
  return { id: row.id };
}

/** Open flags, oldest first, for the moderation queue. */
export async function listOpenAbuseReports(): Promise<
  {
    id: string;
    reason: string;
    details: string | null;
    kind: ReportKind;
    reportId: string;
    createdAt: string;
  }[]
> {
  const rows = await getDb()
    .select({
      id: abuseReports.id,
      reason: abuseReports.reason,
      details: abuseReports.details,
      missingReportId: abuseReports.missingReportId,
      foundReportId: abuseReports.foundReportId,
      createdAt: abuseReports.createdAt,
    })
    .from(abuseReports)
    .where(isNull(abuseReports.resolvedAt))
    .orderBy(asc(abuseReports.createdAt))
    .limit(100);

  return rows.map((row) => ({
    id: row.id,
    reason: row.reason,
    details: row.details,
    kind: row.missingReportId ? ("missing" as const) : ("found" as const),
    reportId: (row.missingReportId ?? row.foundReportId) as string,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function resolveAbuseReport(reviewer: CurrentUser, abuseReportId: string): Promise<void> {
  const db = getDb();

  const updated = await db
    .update(abuseReports)
    .set({ resolvedAt: new Date(), resolvedBy: reviewer.id })
    .where(and(eq(abuseReports.id, abuseReportId), isNull(abuseReports.resolvedAt)))
    .returning({ id: abuseReports.id });

  if (updated.length === 0) {
    // Either the id is wrong or a colleague resolved it a moment ago. Both are
    // "there is nothing here to act on", and a 404 is the honest answer —
    // rather than the 500 that loading-then-updating would produce on a null.
    throw notFound("That flag has already been dealt with, or does not exist.");
  }

  await recordAudit(db, {
    actor: reviewer,
    action: "abuse_report.resolved",
    targetType: "abuse_report",
    targetId: abuseReportId,
  });
}
