/**
 * Reading reports.
 *
 * Two rules shape every function here.
 *
 * **Public queries do not select private columns.** The feed's select list
 * names the columns it needs and contact details are not among them, so on a
 * public request those values never leave Postgres — let alone reach the
 * process, a log, or a serialised React payload. The projection in
 * ./visibility.ts is the second line of defence, not the first.
 *
 * **Photographs are fetched in one query, not one per report.** A feed page of
 * 24 cases with a per-case photo query is 25 round trips, and on a serverless
 * function each of those crosses a network. Every list here loads its
 * photographs with a single `IN` query keyed by report id and groups them in
 * memory.
 */
import { and, asc, desc, eq, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import type { ReportStatus } from "@/db/enums";
import {
  foundPersonReports,
  missingPersonReports,
  reportPhotos,
  users,
} from "@/db/schema";
import type { Page } from "@/lib/validation/common";
import type { FeedFilters } from "@/lib/validation/reports";

import {
  type FoundReportView,
  type MissingReportView,
  type PhotoRow,
  projectFound,
  projectMissing,
  type PublicFoundReport,
  type PublicMissingReport,
  toPublicFound,
  toPublicMissing,
  type Viewer,
} from "./visibility";

/** Statuses the public feed shows. `resolved` is excluded — see `feedStatuses`. */
const FEED_STATUSES: ReportStatus[] = ["published", "matched"];

/**
 * A resolved case leaves the feed.
 *
 * Once somebody has been found, continuing to show their photograph and last
 * known location to strangers serves nobody and harms the person it describes.
 * The case remains reachable at its own URL for anyone holding the link, and
 * stays fully visible to its owner and to reviewers.
 */
function feedStatuses(): ReportStatus[] {
  return FEED_STATUSES;
}

// ---------------------------------------------------------------------------
// Photographs, batched
// ---------------------------------------------------------------------------

type PhotoIndex = Map<string, PhotoRow[]>;

async function loadPhotos(kind: "missing" | "found", reportIds: string[]): Promise<PhotoIndex> {
  const index: PhotoIndex = new Map();
  if (reportIds.length === 0) return index;

  const parentColumn =
    kind === "missing" ? reportPhotos.missingReportId : reportPhotos.foundReportId;

  const rows = await getDb()
    .select({
      id: reportPhotos.id,
      blobUrl: reportPhotos.blobUrl,
      parentId: parentColumn,
    })
    .from(reportPhotos)
    .where(inArray(parentColumn, reportIds))
    .orderBy(asc(reportPhotos.sortOrder), asc(reportPhotos.createdAt));

  for (const row of rows) {
    if (!row.parentId) continue;
    const bucket = index.get(row.parentId);
    if (bucket) bucket.push({ id: row.id, blobUrl: row.blobUrl });
    else index.set(row.parentId, [{ id: row.id, blobUrl: row.blobUrl }]);
  }
  return index;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

function missingFilterConditions(filters: FeedFilters): SQL[] {
  const conditions: SQL[] = [];

  if (filters.query) {
    const pattern = `%${filters.query}%`;
    // Trigram-indexed on lower(full_name) — see drizzle/0001_search_indexes.sql.
    // The description columns are searched too but are not indexed; they only
    // ever run alongside the status predicate, which bounds the candidate set.
    conditions.push(
      or(
        sql`lower(${missingPersonReports.fullName}) LIKE lower(${pattern})`,
        sql`lower(coalesce(${missingPersonReports.distinguishingFeatures}, '')) LIKE lower(${pattern})`,
        sql`lower(coalesce(${missingPersonReports.clothingDescription}, '')) LIKE lower(${pattern})`,
      ) as SQL,
    );
  }
  if (filters.city) {
    conditions.push(
      sql`lower(${missingPersonReports.lastSeenCity}) LIKE lower(${`%${filters.city}%`})`,
    );
  }
  if (filters.gender) {
    conditions.push(eq(missingPersonReports.gender, filters.gender));
  }
  if (filters.minAge !== undefined) {
    conditions.push(gte(missingPersonReports.age, filters.minAge));
  }
  if (filters.maxAge !== undefined) {
    conditions.push(lte(missingPersonReports.age, filters.maxAge));
  }
  if (filters.dateFrom) {
    conditions.push(gte(missingPersonReports.lastSeenAt, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(missingPersonReports.lastSeenAt, filters.dateTo));
  }
  return conditions;
}

function foundFilterConditions(filters: FeedFilters): SQL[] {
  const conditions: SQL[] = [];

  if (filters.query) {
    const pattern = `%${filters.query}%`;
    conditions.push(
      or(
        sql`lower(coalesce(${foundPersonReports.distinguishingFeatures}, '')) LIKE lower(${pattern})`,
        sql`lower(coalesce(${foundPersonReports.notes}, '')) LIKE lower(${pattern})`,
      ) as SQL,
    );
  }
  if (filters.city) {
    conditions.push(sql`lower(${foundPersonReports.foundCity}) LIKE lower(${`%${filters.city}%`})`);
  }
  if (filters.gender) {
    conditions.push(eq(foundPersonReports.gender, filters.gender));
  }
  // An age *range* overlaps the filter's range when the report's lowest is not
  // above the filter's highest and its highest is not below the filter's
  // lowest. A null bound is unknown and must not exclude the report — somebody
  // searching for a 70-year-old should still see a case recorded only as
  // "60 or older".
  if (filters.minAge !== undefined) {
    conditions.push(
      sql`(${foundPersonReports.estimatedAgeMax} IS NULL OR ${foundPersonReports.estimatedAgeMax} >= ${filters.minAge})`,
    );
  }
  if (filters.maxAge !== undefined) {
    conditions.push(
      sql`(${foundPersonReports.estimatedAgeMin} IS NULL OR ${foundPersonReports.estimatedAgeMin} <= ${filters.maxAge})`,
    );
  }
  if (filters.dateFrom) {
    conditions.push(gte(foundPersonReports.foundAt, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(foundPersonReports.foundAt, filters.dateTo));
  }
  return conditions;
}

// ---------------------------------------------------------------------------
// The public feed
// ---------------------------------------------------------------------------

/** Column list for a public read: no contact details, no reviewer notes. */
const publicMissingColumns = {
  id: missingPersonReports.id,
  reporterId: missingPersonReports.reporterId,
  fullName: missingPersonReports.fullName,
  age: missingPersonReports.age,
  gender: missingPersonReports.gender,
  heightCm: missingPersonReports.heightCm,
  clothingDescription: missingPersonReports.clothingDescription,
  distinguishingFeatures: missingPersonReports.distinguishingFeatures,
  lastSeenAddress: missingPersonReports.lastSeenAddress,
  lastSeenCity: missingPersonReports.lastSeenCity,
  lastSeenLatitude: missingPersonReports.lastSeenLatitude,
  lastSeenLongitude: missingPersonReports.lastSeenLongitude,
  lastSeenAt: missingPersonReports.lastSeenAt,
  status: missingPersonReports.status,
  createdAt: missingPersonReports.createdAt,
  updatedAt: missingPersonReports.updatedAt,
  reporterName: users.fullName,
} as const;

const publicFoundColumns = {
  id: foundPersonReports.id,
  reporterId: foundPersonReports.reporterId,
  estimatedAgeMin: foundPersonReports.estimatedAgeMin,
  estimatedAgeMax: foundPersonReports.estimatedAgeMax,
  gender: foundPersonReports.gender,
  heightCm: foundPersonReports.heightCm,
  distinguishingFeatures: foundPersonReports.distinguishingFeatures,
  notes: foundPersonReports.notes,
  foundAddress: foundPersonReports.foundAddress,
  foundCity: foundPersonReports.foundCity,
  foundLatitude: foundPersonReports.foundLatitude,
  foundLongitude: foundPersonReports.foundLongitude,
  foundAt: foundPersonReports.foundAt,
  status: foundPersonReports.status,
  createdAt: foundPersonReports.createdAt,
  updatedAt: foundPersonReports.updatedAt,
  reporterName: users.fullName,
} as const;

function missingOrder(sort: FeedFilters["sort"]): SQL {
  if (sort === "oldest") return asc(missingPersonReports.createdAt) as unknown as SQL;
  if (sort === "recently_seen") return desc(missingPersonReports.lastSeenAt) as unknown as SQL;
  return desc(missingPersonReports.createdAt) as unknown as SQL;
}

function foundOrder(sort: FeedFilters["sort"]): SQL {
  if (sort === "oldest") return asc(foundPersonReports.createdAt) as unknown as SQL;
  if (sort === "recently_seen") return desc(foundPersonReports.foundAt) as unknown as SQL;
  return desc(foundPersonReports.createdAt) as unknown as SQL;
}

export async function listMissingFeed(
  filters: FeedFilters,
  pagination: { offset: number; limit: number },
  viewer: Viewer,
): Promise<Page<PublicMissingReport>> {
  const db = getDb();
  const where = and(
    inArray(missingPersonReports.status, feedStatuses()),
    ...missingFilterConditions(filters),
  );

  // Count and page in parallel: they are independent, and awaiting them in
  // sequence doubles the latency of every feed request for no reason.
  const [rows, [countRow]] = await Promise.all([
    db
      .select(publicMissingColumns)
      .from(missingPersonReports)
      .leftJoin(users, eq(missingPersonReports.reporterId, users.id))
      .where(where)
      .orderBy(missingOrder(filters.sort))
      .limit(pagination.limit)
      .offset(pagination.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(missingPersonReports)
      .where(where),
  ]);

  const photos = await loadPhotos(
    "missing",
    rows.map((row) => row.id),
  );

  return {
    items: rows.map((row) =>
      // Always the public projection, even for an owner or reviewer: the query
      // did not select the private columns, so there is nothing else to show.
      // The case page is where owner detail appears.
      toPublicMissing(row, { fullName: row.reporterName }, photos.get(row.id) ?? [], viewer),
    ),
    total: countRow?.count ?? 0,
    offset: pagination.offset,
    limit: pagination.limit,
  };
}

export async function listFoundFeed(
  filters: FeedFilters,
  pagination: { offset: number; limit: number },
  viewer: Viewer,
): Promise<Page<PublicFoundReport>> {
  const db = getDb();
  const where = and(
    inArray(foundPersonReports.status, feedStatuses()),
    ...foundFilterConditions(filters),
  );

  const [rows, [countRow]] = await Promise.all([
    db
      .select(publicFoundColumns)
      .from(foundPersonReports)
      .leftJoin(users, eq(foundPersonReports.reporterId, users.id))
      .where(where)
      .orderBy(foundOrder(filters.sort))
      .limit(pagination.limit)
      .offset(pagination.offset),
    db.select({ count: sql<number>`count(*)::int` }).from(foundPersonReports).where(where),
  ]);

  const photos = await loadPhotos(
    "found",
    rows.map((row) => row.id),
  );

  return {
    items: rows.map((row) =>
      toPublicFound(row, { fullName: row.reporterName }, photos.get(row.id) ?? [], viewer),
    ),
    total: countRow?.count ?? 0,
    offset: pagination.offset,
    limit: pagination.limit,
  };
}

// ---------------------------------------------------------------------------
// A single case
// ---------------------------------------------------------------------------

/**
 * One report by id, or null.
 *
 * Selects every column including the private ones, because the caller may be
 * the owner or a reviewer, and hands the row to `projectMissing` which decides
 * what survives. Callers must invoke `assertCanViewReport` — see the wrapper in
 * ./service.ts, which is what routes actually use.
 */
export async function findMissingById(
  reportId: string,
  viewer: Viewer,
): Promise<{ view: MissingReportView; reporterId: string; status: ReportStatus } | null> {
  const db = getDb();

  const [row] = await db
    .select({
      report: missingPersonReports,
      reporterName: users.fullName,
    })
    .from(missingPersonReports)
    .leftJoin(users, eq(missingPersonReports.reporterId, users.id))
    .where(eq(missingPersonReports.id, reportId))
    .limit(1);

  if (!row) return null;

  const photos = await db
    .select({ id: reportPhotos.id, blobUrl: reportPhotos.blobUrl })
    .from(reportPhotos)
    .where(eq(reportPhotos.missingReportId, reportId))
    .orderBy(asc(reportPhotos.sortOrder), asc(reportPhotos.createdAt));

  return {
    view: projectMissing(row.report, { fullName: row.reporterName }, photos, viewer),
    reporterId: row.report.reporterId,
    status: row.report.status,
  };
}

export async function findFoundById(
  reportId: string,
  viewer: Viewer,
): Promise<{ view: FoundReportView; reporterId: string; status: ReportStatus } | null> {
  const db = getDb();

  const [row] = await db
    .select({
      report: foundPersonReports,
      reporterName: users.fullName,
    })
    .from(foundPersonReports)
    .leftJoin(users, eq(foundPersonReports.reporterId, users.id))
    .where(eq(foundPersonReports.id, reportId))
    .limit(1);

  if (!row) return null;

  const photos = await db
    .select({ id: reportPhotos.id, blobUrl: reportPhotos.blobUrl })
    .from(reportPhotos)
    .where(eq(reportPhotos.foundReportId, reportId))
    .orderBy(asc(reportPhotos.sortOrder), asc(reportPhotos.createdAt));

  return {
    view: projectFound(row.report, { fullName: row.reporterName }, photos, viewer),
    reporterId: row.report.reporterId,
    status: row.report.status,
  };
}

// ---------------------------------------------------------------------------
// "My reports"
// ---------------------------------------------------------------------------

export async function listMyReports(
  userId: string,
  viewer: Viewer,
): Promise<{ missing: MissingReportView[]; found: FoundReportView[] }> {
  const db = getDb();

  const [missingRows, foundRows] = await Promise.all([
    db
      .select({ report: missingPersonReports, reporterName: users.fullName })
      .from(missingPersonReports)
      .leftJoin(users, eq(missingPersonReports.reporterId, users.id))
      .where(eq(missingPersonReports.reporterId, userId))
      .orderBy(desc(missingPersonReports.createdAt)),
    db
      .select({ report: foundPersonReports, reporterName: users.fullName })
      .from(foundPersonReports)
      .leftJoin(users, eq(foundPersonReports.reporterId, users.id))
      .where(eq(foundPersonReports.reporterId, userId))
      .orderBy(desc(foundPersonReports.createdAt)),
  ]);

  const [missingPhotos, foundPhotos] = await Promise.all([
    loadPhotos(
      "missing",
      missingRows.map((row) => row.report.id),
    ),
    loadPhotos(
      "found",
      foundRows.map((row) => row.report.id),
    ),
  ]);

  return {
    missing: missingRows.map((row) =>
      projectMissing(
        row.report,
        { fullName: row.reporterName },
        missingPhotos.get(row.report.id) ?? [],
        viewer,
      ),
    ),
    found: foundRows.map((row) =>
      projectFound(
        row.report,
        { fullName: row.reporterName },
        foundPhotos.get(row.report.id) ?? [],
        viewer,
      ),
    ),
  };
}

// ---------------------------------------------------------------------------
// The reviewer queue
// ---------------------------------------------------------------------------

/**
 * Reports awaiting a decision, oldest first.
 *
 * Oldest first is the whole point of a queue on this platform: the case that
 * has been waiting longest is the one where the delay is doing the most harm.
 */
export async function listReviewQueue(
  kind: "missing" | "found",
  statuses: ReportStatus[],
  pagination: { offset: number; limit: number },
  viewer: Viewer,
): Promise<Page<MissingReportView | FoundReportView>> {
  const db = getDb();

  if (kind === "missing") {
    const where = inArray(missingPersonReports.status, statuses);
    const [rows, [countRow]] = await Promise.all([
      db
        .select({ report: missingPersonReports, reporterName: users.fullName })
        .from(missingPersonReports)
        .leftJoin(users, eq(missingPersonReports.reporterId, users.id))
        .where(where)
        .orderBy(asc(missingPersonReports.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.select({ count: sql<number>`count(*)::int` }).from(missingPersonReports).where(where),
    ]);

    const photos = await loadPhotos(
      "missing",
      rows.map((row) => row.report.id),
    );

    return {
      items: rows.map((row) =>
        projectMissing(
          row.report,
          { fullName: row.reporterName },
          photos.get(row.report.id) ?? [],
          viewer,
        ),
      ),
      total: countRow?.count ?? 0,
      offset: pagination.offset,
      limit: pagination.limit,
    };
  }

  const where = inArray(foundPersonReports.status, statuses);
  const [rows, [countRow]] = await Promise.all([
    db
      .select({ report: foundPersonReports, reporterName: users.fullName })
      .from(foundPersonReports)
      .leftJoin(users, eq(foundPersonReports.reporterId, users.id))
      .where(where)
      .orderBy(asc(foundPersonReports.createdAt))
      .limit(pagination.limit)
      .offset(pagination.offset),
    db.select({ count: sql<number>`count(*)::int` }).from(foundPersonReports).where(where),
  ]);

  const photos = await loadPhotos(
    "found",
    rows.map((row) => row.report.id),
  );

  return {
    items: rows.map((row) =>
      projectFound(
        row.report,
        { fullName: row.reporterName },
        photos.get(row.report.id) ?? [],
        viewer,
      ),
    ),
    total: countRow?.count ?? 0,
    offset: pagination.offset,
    limit: pagination.limit,
  };
}

/**
 * Counts for the reviewer console's queue badges.
 *
 * One round trip for all of them rather than four, because these render in the
 * console's navigation on every page within it.
 */
export async function reviewQueueCounts(): Promise<{
  pendingMissing: number;
  pendingFound: number;
  possibleMatches: number;
  openAbuseReports: number;
}> {
  const result = await getDb().execute<{
    pending_missing: number;
    pending_found: number;
    possible_matches: number;
    open_abuse_reports: number;
  }>(sql`
    SELECT
      (SELECT count(*)::int FROM missing_person_reports WHERE status IN ('pending', 'under_review')) AS pending_missing,
      (SELECT count(*)::int FROM found_person_reports   WHERE status IN ('pending', 'under_review')) AS pending_found,
      (SELECT count(*)::int FROM matches                WHERE status = 'possible')                  AS possible_matches,
      (SELECT count(*)::int FROM abuse_reports          WHERE resolved_at IS NULL)                  AS open_abuse_reports
  `);

  const row = result.rows[0];
  return {
    pendingMissing: Number(row?.pending_missing ?? 0),
    pendingFound: Number(row?.pending_found ?? 0),
    possibleMatches: Number(row?.possible_matches ?? 0),
    openAbuseReports: Number(row?.open_abuse_reports ?? 0),
  };
}

/**
 * Distinct cities that currently have visible cases, for the feed's filter.
 *
 * A dropdown of real values beats a free-text box that returns nothing for a
 * misspelling and gives no hint why. Cheap because it only considers rows the
 * feed would show anyway.
 */
export async function listFeedCities(kind: "missing" | "found"): Promise<string[]> {
  const column =
    kind === "missing" ? missingPersonReports.lastSeenCity : foundPersonReports.foundCity;
  const table = kind === "missing" ? missingPersonReports : foundPersonReports;
  const statusColumn = kind === "missing" ? missingPersonReports.status : foundPersonReports.status;

  const rows = await getDb()
    .selectDistinct({ city: column })
    .from(table)
    .where(inArray(statusColumn, feedStatuses()))
    .orderBy(asc(column))
    .limit(200);

  return rows.map((row) => row.city).filter((city): city is string => Boolean(city));
}
