/**
 * Matching a missing-person report to a found-person report.
 *
 * This is the most consequential action in the product. Creating a match tells
 * two families that the person they reported may have been found, and getting
 * it wrong means telling somebody their missing daughter has been located when
 * she has not. Every decision below is shaped by that.
 *
 * ## A person decides, always
 *
 * Matches are created and confirmed by a reviewer. `matches.source` and
 * `confidence_score` exist so an assisted matcher can propose links later, but
 * a proposal would enter as `status = 'possible'` and still need a human to
 * confirm it. There is no code path that resolves a case automatically, and
 * there should not be: a false positive here is not a bad recommendation, it is
 * a family being told something untrue about a missing relative.
 *
 * ## Suggestions, not decisions
 *
 * `suggestCandidates` exists to save a reviewer from scrolling two lists. It
 * ranks by attributes that are cheap and verifiable — age overlap, gender,
 * city, timing — and it does not score faces, infer identity or hide anything.
 * A reviewer sees the ranking and both reports in full before doing anything.
 */
import { and, desc, eq, ne, or, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import type { MatchStatus } from "@/db/enums";
import { foundPersonReports, matches, missingPersonReports, users } from "@/db/schema";
import { recordAudit } from "@/server/admin/audit";
import type { CurrentUser } from "@/server/auth/current-user";
import { possibleMatchEmail } from "@/server/email/templates";
import { send } from "@/server/email/mailer";
import { env } from "@/server/config/env";
import { badRequest, conflict, notFound } from "@/server/http/errors";
import { notify } from "@/server/notifications/service";
import { logger } from "@/server/observability/logger";
import { canTransition } from "@/server/reports/status";

/**
 * A report may only be linked while it is actually in circulation.
 *
 * Matching a pending or rejected report would move it to `matched`, from where
 * the only exits are `published` and `resolved` — so a case that was never
 * approved would end up in a state implying it had been, and off the queue that
 * would have got it reviewed.
 */
const MATCHABLE_STATUSES = new Set(["published", "matched"]);

export interface MatchView {
  id: string;
  status: MatchStatus;
  source: "manual_review" | "automated";
  confidenceScore: number | null;
  notes: string | null;
  createdAt: string;
  decidedAt: string | null;
  missing: {
    id: string;
    fullName: string;
    age: number;
    city: string;
    lastSeenAt: string;
    status: string;
  };
  found: {
    id: string;
    estimatedAgeMin: number | null;
    estimatedAgeMax: number | null;
    city: string;
    foundAt: string;
    status: string;
  };
}

const matchSelection = {
  id: matches.id,
  status: matches.status,
  source: matches.source,
  confidenceScore: matches.confidenceScore,
  notes: matches.notes,
  createdAt: matches.createdAt,
  decidedAt: matches.decidedAt,
  missingId: missingPersonReports.id,
  missingName: missingPersonReports.fullName,
  missingAge: missingPersonReports.age,
  missingCity: missingPersonReports.lastSeenCity,
  missingLastSeenAt: missingPersonReports.lastSeenAt,
  missingStatus: missingPersonReports.status,
  foundId: foundPersonReports.id,
  foundAgeMin: foundPersonReports.estimatedAgeMin,
  foundAgeMax: foundPersonReports.estimatedAgeMax,
  foundCity: foundPersonReports.foundCity,
  foundAt: foundPersonReports.foundAt,
  foundStatus: foundPersonReports.status,
} as const;

type MatchRow = {
  [K in keyof typeof matchSelection]: unknown;
};

function toView(row: Record<string, unknown>): MatchView {
  return {
    id: row.id as string,
    status: row.status as MatchStatus,
    source: row.source as "manual_review" | "automated",
    confidenceScore: (row.confidenceScore as number | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: (row.createdAt as Date).toISOString(),
    decidedAt: (row.decidedAt as Date | null)?.toISOString() ?? null,
    missing: {
      id: row.missingId as string,
      fullName: row.missingName as string,
      age: row.missingAge as number,
      city: row.missingCity as string,
      lastSeenAt: (row.missingLastSeenAt as Date).toISOString(),
      status: row.missingStatus as string,
    },
    found: {
      id: row.foundId as string,
      estimatedAgeMin: (row.foundAgeMin as number | null) ?? null,
      estimatedAgeMax: (row.foundAgeMax as number | null) ?? null,
      city: row.foundCity as string,
      foundAt: (row.foundAt as Date).toISOString(),
      status: row.foundStatus as string,
    },
  };
}

export async function listMatches(status?: MatchStatus): Promise<MatchView[]> {
  const rows = await getDb()
    .select(matchSelection)
    .from(matches)
    .innerJoin(missingPersonReports, eq(matches.missingReportId, missingPersonReports.id))
    .innerJoin(foundPersonReports, eq(matches.foundReportId, foundPersonReports.id))
    .where(status ? eq(matches.status, status) : undefined)
    .orderBy(desc(matches.createdAt))
    .limit(100);

  return rows.map((row) => toView(row as Record<string, unknown>));
}

/** Matches touching a report, for the case page's "possible match" panel. */
export async function listMatchesForReport(
  kind: "missing" | "found",
  reportId: string,
): Promise<MatchView[]> {
  const rows = await getDb()
    .select(matchSelection)
    .from(matches)
    .innerJoin(missingPersonReports, eq(matches.missingReportId, missingPersonReports.id))
    .innerJoin(foundPersonReports, eq(matches.foundReportId, foundPersonReports.id))
    .where(
      kind === "missing"
        ? eq(matches.missingReportId, reportId)
        : eq(matches.foundReportId, reportId),
    )
    .orderBy(desc(matches.createdAt));

  return rows.map((row) => toView(row as Record<string, unknown>));
}

// ---------------------------------------------------------------------------
// Creating a match
// ---------------------------------------------------------------------------

export interface CreateMatchInput {
  missingReportId: string;
  foundReportId: string;
  notes: string | null;
}

export async function createMatch(
  reviewer: CurrentUser,
  input: CreateMatchInput,
): Promise<{ id: string }> {
  const db = getDb();

  const [missing] = await db
    .select({
      id: missingPersonReports.id,
      reporterId: missingPersonReports.reporterId,
      status: missingPersonReports.status,
      fullName: missingPersonReports.fullName,
    })
    .from(missingPersonReports)
    .where(eq(missingPersonReports.id, input.missingReportId))
    .limit(1);

  const [found] = await db
    .select({
      id: foundPersonReports.id,
      reporterId: foundPersonReports.reporterId,
      status: foundPersonReports.status,
    })
    .from(foundPersonReports)
    .where(eq(foundPersonReports.id, input.foundReportId))
    .limit(1);

  if (!missing || !found) throw notFound("One of those reports could not be found.");

  for (const [report, label] of [
    [missing, "missing-person"],
    [found, "found-person"],
  ] as const) {
    if (!MATCHABLE_STATUSES.has(report.status)) {
      throw badRequest(
        `The ${label} report is “${report.status.replace(/_/g, " ")}” and cannot be linked yet. Publish it first.`,
      );
    }
  }

  const [existing] = await db
    .select({ id: matches.id, status: matches.status })
    .from(matches)
    .where(
      and(
        eq(matches.missingReportId, input.missingReportId),
        eq(matches.foundReportId, input.foundReportId),
      ),
    )
    .limit(1);

  if (existing) {
    // Without this, re-linking the same pair would send both families a second
    // "possible match" alert about a link they have already been told about —
    // which on this platform is a genuinely cruel thing to get wrong.
    throw conflict(
      `These two reports are already linked (${existing.status}). Open the existing match instead.`,
    );
  }

  // One transaction: the link, both reports' statuses, both notifications and
  // the audit entry. A match that exists while the families were never told is
  // worse than no match, and a status left behind strands a case.
  const matchId = await db.transaction(async (tx) => {
    let created: { id: string } | undefined;
    try {
      [created] = await tx
        .insert(matches)
        .values({
          missingReportId: input.missingReportId,
          foundReportId: input.foundReportId,
          notes: input.notes,
          createdBy: reviewer.id,
          status: "possible",
          source: "manual_review",
        })
        .returning({ id: matches.id });
    } catch (error) {
      // The unique index on the pair is the authority; the check above only
      // turns the common case into a clean message. Two reviewers clicking at
      // the same moment land here.
      if (isUniqueViolation(error)) {
        throw conflict("These two reports have just been linked by someone else.");
      }
      throw error;
    }

    if (!created) throw new Error("Insert returned no row");

    if (missing.status === "published") {
      await tx
        .update(missingPersonReports)
        .set({ status: "matched", updatedAt: new Date() })
        .where(eq(missingPersonReports.id, missing.id));
    }
    if (found.status === "published") {
      await tx
        .update(foundPersonReports)
        .set({ status: "matched", updatedAt: new Date() })
        .where(eq(foundPersonReports.id, found.id));
    }

    await notify(tx, {
      userId: missing.reporterId,
      type: "possible_match_found",
      title: "A possible match on your report",
      body:
        `A reviewer has linked your report about ${missing.fullName} to a found-person report. ` +
        "Nothing is confirmed yet — a person checks every link.",
      href: `/cases/missing/${missing.id}`,
    });

    // A set, because one person can plausibly have filed both reports — and
    // sending them the same alert twice would be a small cruelty.
    if (found.reporterId !== missing.reporterId) {
      await notify(tx, {
        userId: found.reporterId,
        type: "possible_match_found",
        title: "A possible match on your report",
        body:
          "A reviewer has linked the person you reported found to a missing-person report. " +
          "Nothing is confirmed yet — a person checks every link.",
        href: `/cases/found/${found.id}`,
      });
    }

    await recordAudit(tx, {
      actor: reviewer,
      action: "match.created",
      targetType: "match",
      targetId: created.id,
      metadata: { missingReportId: missing.id, foundReportId: found.id },
    });

    return created.id;
  });

  // Email is sent after the transaction commits, and its failure is not allowed
  // to roll anything back. A match that exists and an email that did not arrive
  // is recoverable — the in-app notification is already there. A transaction
  // rolled back because an SMTP server was slow is not.
  void notifyByEmail([missing.reporterId, found.reporterId], matchId);

  logger.info("Match created", { matchId });
  return { id: matchId };
}

async function notifyByEmail(reporterIds: string[], matchId: string): Promise<void> {
  try {
    const unique = [...new Set(reporterIds)];
    const rows = await getDb()
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(or(...unique.map((id) => eq(users.id, id))));

    const link = `${env.siteUrl}/notifications`;
    for (const row of rows) {
      await send(row.email, possibleMatchEmail(link));
    }
  } catch (error) {
    logger.error("Could not send match emails", {
      matchId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

// ---------------------------------------------------------------------------
// Deciding a match
// ---------------------------------------------------------------------------

/**
 * Confirms or dismisses a match.
 *
 * Confirming resolves both reports. Dismissing returns both to `published`,
 * which is the part that is easy to leave out and expensive to omit: without
 * it, a wrongly-flagged pair stays in `matched` forever — off the public feed,
 * so nobody can recognise the person, and with no legal transition left for a
 * reviewer to use.
 *
 * Each report is moved only if the transition is legal from where it currently
 * is. A second match on the same report may have moved it already, and that
 * must not fail the whole operation.
 */
export async function decideMatch(
  reviewer: CurrentUser,
  matchId: string,
  decision: { status: "confirmed" | "dismissed"; notes: string | null },
): Promise<{ status: MatchStatus }> {
  const db = getDb();

  const [match] = await db
    .select({
      id: matches.id,
      status: matches.status,
      missingReportId: matches.missingReportId,
      foundReportId: matches.foundReportId,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!match) throw notFound("That match could not be found.");
  if (match.status !== "possible") {
    throw conflict(`This match has already been ${match.status}.`);
  }

  const targetReportStatus = decision.status === "confirmed" ? "resolved" : "published";

  await db.transaction(async (tx) => {
    await tx
      .update(matches)
      .set({
        status: decision.status,
        ...(decision.notes !== null ? { notes: decision.notes } : {}),
        decidedBy: reviewer.id,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(matches.id, matchId));

    const [missing] = await tx
      .select({
        id: missingPersonReports.id,
        reporterId: missingPersonReports.reporterId,
        status: missingPersonReports.status,
      })
      .from(missingPersonReports)
      .where(eq(missingPersonReports.id, match.missingReportId))
      .limit(1);

    const [found] = await tx
      .select({
        id: foundPersonReports.id,
        reporterId: foundPersonReports.reporterId,
        status: foundPersonReports.status,
      })
      .from(foundPersonReports)
      .where(eq(foundPersonReports.id, match.foundReportId))
      .limit(1);

    if (missing && canTransition(missing.status, targetReportStatus)) {
      await tx
        .update(missingPersonReports)
        .set({ status: targetReportStatus, updatedAt: new Date() })
        .where(eq(missingPersonReports.id, missing.id));
    }
    if (found && canTransition(found.status, targetReportStatus)) {
      await tx
        .update(foundPersonReports)
        .set({ status: targetReportStatus, updatedAt: new Date() })
        .where(eq(foundPersonReports.id, found.id));
    }

    const reporterIds = new Set(
      [missing?.reporterId, found?.reporterId].filter((id): id is string => Boolean(id)),
    );

    for (const reporterId of reporterIds) {
      await notify(tx, {
        userId: reporterId,
        type: decision.status === "confirmed" ? "match_confirmed" : "match_dismissed",
        title:
          decision.status === "confirmed"
            ? "A match on your report was confirmed"
            : "A possible match on your report was ruled out",
        body:
          decision.status === "confirmed"
            ? "A reviewer has confirmed the link and your case has been marked resolved."
            : "A reviewer checked the link and the two reports are not the same person. Your case is back on the public feed.",
        href: "/dashboard",
      });
    }

    await recordAudit(tx, {
      actor: reviewer,
      action: decision.status === "confirmed" ? "match.confirmed" : "match.dismissed",
      targetType: "match",
      targetId: matchId,
      metadata: { reportStatus: targetReportStatus },
    });
  });

  logger.info("Match decided", { matchId, decision: decision.status });
  return { status: decision.status };
}

// ---------------------------------------------------------------------------
// Candidate suggestions
// ---------------------------------------------------------------------------

export interface CandidateSuggestion {
  foundReportId: string;
  city: string;
  foundAt: string;
  estimatedAgeMin: number | null;
  estimatedAgeMax: number | null;
  gender: string;
  /** 0–100. A convenience ordering, not a probability — see `reasons`. */
  score: number;
  /** Why this appeared, in plain words, so a reviewer can judge the ranking itself. */
  reasons: string[];
}

/**
 * Found-person reports worth a reviewer's attention for a given missing case.
 *
 * The scoring is deliberately simple and entirely explainable: an age range
 * that overlaps, the same gender, the same city, and a found date at or after
 * the person was last seen. Every contribution is reported in `reasons`, so a
 * reviewer can see that a case ranked highly because of the city and not
 * mistake the number for a likelihood.
 *
 * Ranked in SQL rather than by fetching everything and sorting in memory: the
 * candidate set is every published found report, which is unbounded.
 */
export async function suggestCandidates(
  missingReportId: string,
  limit = 8,
): Promise<CandidateSuggestion[]> {
  const db = getDb();

  const [missing] = await db
    .select({
      id: missingPersonReports.id,
      age: missingPersonReports.age,
      gender: missingPersonReports.gender,
      city: missingPersonReports.lastSeenCity,
      lastSeenAt: missingPersonReports.lastSeenAt,
    })
    .from(missingPersonReports)
    .where(eq(missingPersonReports.id, missingReportId))
    .limit(1);

  if (!missing) throw notFound("That case could not be found.");

  // A five-year tolerance either side of the recorded age. An estimate from
  // somebody who has just found an unidentified person is not precise, and a
  // strict overlap would hide the right case over a two-year difference.
  const AGE_TOLERANCE = 5;

  const rows = await db
    .select({
      id: foundPersonReports.id,
      city: foundPersonReports.foundCity,
      foundAt: foundPersonReports.foundAt,
      estimatedAgeMin: foundPersonReports.estimatedAgeMin,
      estimatedAgeMax: foundPersonReports.estimatedAgeMax,
      gender: foundPersonReports.gender,
      sameCity: sql<boolean>`lower(${foundPersonReports.foundCity}) = lower(${missing.city})`,
      sameGender: sql<boolean>`${foundPersonReports.gender} = ${missing.gender}`,
      ageOverlaps: sql<boolean>`
        (${foundPersonReports.estimatedAgeMin} IS NULL OR ${foundPersonReports.estimatedAgeMin} <= ${missing.age + AGE_TOLERANCE})
        AND (${foundPersonReports.estimatedAgeMax} IS NULL OR ${foundPersonReports.estimatedAgeMax} >= ${missing.age - AGE_TOLERANCE})
      `,
      afterLastSeen: sql<boolean>`${foundPersonReports.foundAt} >= ${missing.lastSeenAt}`,
    })
    .from(foundPersonReports)
    .where(
      and(
        // Only reports a reviewer could actually link, and never one already
        // paired with this exact case.
        or(eq(foundPersonReports.status, "published"), eq(foundPersonReports.status, "matched")),
        sql`NOT EXISTS (
          SELECT 1 FROM ${matches}
          WHERE ${matches.missingReportId} = ${missingReportId}
            AND ${matches.foundReportId} = ${foundPersonReports.id}
        )`,
        ne(foundPersonReports.status, "rejected"),
      ),
    )
    .orderBy(
      desc(sql`
        (CASE WHEN lower(${foundPersonReports.foundCity}) = lower(${missing.city}) THEN 35 ELSE 0 END)
        + (CASE WHEN ${foundPersonReports.gender} = ${missing.gender} THEN 20 ELSE 0 END)
        + (CASE WHEN (${foundPersonReports.estimatedAgeMin} IS NULL OR ${foundPersonReports.estimatedAgeMin} <= ${missing.age + AGE_TOLERANCE})
                 AND (${foundPersonReports.estimatedAgeMax} IS NULL OR ${foundPersonReports.estimatedAgeMax} >= ${missing.age - AGE_TOLERANCE})
                THEN 30 ELSE 0 END)
        + (CASE WHEN ${foundPersonReports.foundAt} >= ${missing.lastSeenAt} THEN 15 ELSE 0 END)
      `),
      desc(foundPersonReports.foundAt),
    )
    .limit(limit);

  return rows.map((row) => {
    const reasons: string[] = [];
    let score = 0;
    if (row.sameCity) {
      score += 35;
      reasons.push(`Found in ${row.city}, where they were last seen`);
    }
    if (row.ageOverlaps) {
      score += 30;
      reasons.push("Estimated age is consistent");
    }
    if (row.sameGender) {
      score += 20;
      reasons.push("Same recorded gender");
    }
    if (row.afterLastSeen) {
      score += 15;
      reasons.push("Found after they were last seen");
    }
    if (reasons.length === 0) reasons.push("No attributes in common — shown for completeness");

    return {
      foundReportId: row.id,
      city: row.city,
      foundAt: row.foundAt.toISOString(),
      estimatedAgeMin: row.estimatedAgeMin,
      estimatedAgeMax: row.estimatedAgeMax,
      gender: row.gender,
      score,
      reasons,
    };
  });
}

export type { MatchRow };
