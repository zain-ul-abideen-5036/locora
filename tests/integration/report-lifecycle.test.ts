import { eq } from "drizzle-orm";
import { expect, it } from "vitest";

import { getDb } from "@/db/client";
import {
  auditLogs,
  foundPersonReports,
  matches,
  missingPersonReports,
  notifications,
} from "@/db/schema";
import { createMatch, decideMatch, listMatches, suggestCandidates } from "@/server/matches/service";
import { listForUser } from "@/server/notifications/service";
import {
  listFoundFeed,
  listMissingFeed,
  listMyReports,
  reviewQueueCounts,
} from "@/server/reports/queries";
import { createFoundReport as fileFoundReport, createMissingReport as fileMissingReport, reviewReport } from "@/server/reports/service";

import {
  createFoundReport,
  createMissingReport,
  createUser,
  describeDb,
} from "../helpers/factories";

/**
 * The case lifecycle, end to end through the service layer.
 *
 * Filing, review, publication, matching and resolution — asserted through what
 * a viewer would actually see afterwards rather than through internal state,
 * because "the row says published" and "a stranger can find it on the feed" are
 * different claims and only the second one matters.
 */

describeDb("filing a report", () => {
  it("puts a new report in the queue, never straight onto the feed", async () => {
    const user = await createUser();

    const { id } = await fileMissingReport(user, {
      fullName: "Aisha Khan",
      age: 12,
      gender: "female",
      heightCm: 140,
      clothingDescription: "Navy uniform",
      distinguishingFeatures: null,
      lastSeenAddress: "Near Liberty Market",
      lastSeenCity: "Lahore",
      lastSeenAt: new Date("2026-08-01T14:30:00Z"),
      latitude: 31.5204,
      longitude: 74.3587,
      contactName: "Farah Siddiqui",
      contactPhone: "+92 300 1234567",
      contactEmail: null,
      policeReportNumber: null,
    });

    const [row] = await getDb()
      .select()
      .from(missingPersonReports)
      .where(eq(missingPersonReports.id, id));

    // The status is not taken from the request under any circumstances.
    expect(row?.status).toBe("pending");
    expect(row?.reporterId).toBe(user.id);

    // And it is genuinely invisible to the public, not merely flagged.
    const feed = await listMissingFeed({}, { offset: 0, limit: 20 }, null);
    expect(feed.items).toHaveLength(0);
  });

  it("files a found report with its age range and private whereabouts intact", async () => {
    const user = await createUser();

    const { id } = await fileFoundReport(user, {
      estimatedAgeMin: 60,
      estimatedAgeMax: 75,
      gender: "male",
      heightCm: 168,
      distinguishingFeatures: "Walks with a stick",
      notes: null,
      foundAddress: "Cantt terminal",
      foundCity: "Karachi",
      foundAt: new Date("2026-08-20T08:00:00Z"),
      currentWhereabouts: "District hospital",
      latitude: null,
      longitude: null,
      contactName: "Sara Ahmed",
      contactPhone: "+92 301 9876543",
      contactEmail: null,
    });

    const [row] = await getDb().select().from(foundPersonReports).where(eq(foundPersonReports.id, id));
    expect(row?.estimatedAgeMin).toBe(60);
    expect(row?.estimatedAgeMax).toBe(75);
    expect(row?.currentWhereabouts).toBe("District hospital");
    // Coordinates are optional and stored as a null pair, never half-set.
    expect(row?.foundLatitude).toBeNull();
    expect(row?.foundLongitude).toBeNull();
  });
});

describeDb("review decisions", () => {
  it("publishes a report, notifies the reporter, and records the action", async () => {
    const reporter = await createUser();
    const reviewer = await createUser({ role: "admin" });
    const report = await createMissingReport(reporter.id, { status: "pending" });

    await reviewReport("missing", report.id, reviewer, { status: "published", reviewNotes: null });

    // Now on the public feed.
    const feed = await listMissingFeed({}, { offset: 0, limit: 20 }, null);
    expect(feed.items.map((item) => item.id)).toContain(report.id);

    // The reporter has been told.
    const alerts = await listForUser(reporter.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.type).toBe("report_status_changed");
    expect(alerts[0]?.href).toBe(`/cases/missing/${report.id}`);

    // And it is on the record, against the reviewer who did it.
    const trail = await getDb().select().from(auditLogs);
    expect(trail).toHaveLength(1);
    expect(trail[0]?.action).toBe("report.status_changed");
    expect(trail[0]?.actorId).toBe(reviewer.id);
    expect(trail[0]?.metadata).toMatchObject({ from: "pending", to: "published" });
  });

  it("sends the reviewer's note to the reporter when declining", async () => {
    const reporter = await createUser();
    const reviewer = await createUser({ role: "admin" });
    const report = await createMissingReport(reporter.id, { status: "pending" });

    await reviewReport("missing", report.id, reviewer, {
      status: "rejected",
      reviewNotes: "We could not verify this. Please add a police reference and file again.",
    });

    const alerts = await listForUser(reporter.id);
    // The note is in the message, not just stored on the row — "your report was
    // not published" with no explanation is not something this product sends.
    expect(alerts[0]?.body).toContain("police reference");
  });

  it("stays silent for an internal review step", async () => {
    // `under_review` may be set several times as a reviewer works a queue.
    const reporter = await createUser();
    const reviewer = await createUser({ role: "admin" });
    const report = await createMissingReport(reporter.id, { status: "pending" });

    await reviewReport("missing", report.id, reviewer, { status: "under_review", reviewNotes: null });

    expect(await listForUser(reporter.id)).toHaveLength(0);
    // Still recorded, though: every reviewer action is accountable.
    expect(await getDb().select().from(auditLogs)).toHaveLength(1);
  });

  it("refuses an illegal transition and changes nothing", async () => {
    const reporter = await createUser();
    const reviewer = await createUser({ role: "admin" });
    const report = await createMissingReport(reporter.id, { status: "resolved" });

    await expect(
      reviewReport("missing", report.id, reviewer, { status: "published", reviewNotes: null }),
    ).rejects.toMatchObject({ status: 400 });

    const [row] = await getDb()
      .select()
      .from(missingPersonReports)
      .where(eq(missingPersonReports.id, report.id));
    expect(row?.status).toBe("resolved");
    // No audit entry and no notification for an action that did not happen.
    expect(await getDb().select().from(auditLogs)).toHaveLength(0);
    expect(await listForUser(reporter.id)).toHaveLength(0);
  });

  it("does not erase an earlier note when no new one is given", async () => {
    // Publishing a previously-declined report should not silently wipe the
    // explanation of why it was declined the first time.
    const reporter = await createUser();
    const reviewer = await createUser({ role: "admin" });
    const report = await createMissingReport(reporter.id, { status: "pending" });

    await reviewReport("missing", report.id, reviewer, {
      status: "rejected",
      reviewNotes: "Missing a police reference number entirely.",
    });
    await reviewReport("missing", report.id, reviewer, { status: "pending", reviewNotes: null });

    const [row] = await getDb()
      .select()
      .from(missingPersonReports)
      .where(eq(missingPersonReports.id, report.id));
    expect(row?.reviewNotes).toBe("Missing a police reference number entirely.");
  });
});

describeDb("the public feed", () => {
  it("shows published and matched cases, and hides everything else", async () => {
    const reporter = await createUser();

    await createMissingReport(reporter.id, { status: "published", fullName: "Published Person" });
    await createMissingReport(reporter.id, { status: "matched", fullName: "Matched Person" });
    await createMissingReport(reporter.id, { status: "pending", fullName: "Pending Person" });
    await createMissingReport(reporter.id, { status: "rejected", fullName: "Rejected Person" });
    // A resolved case leaves the feed: continuing to show a photograph of
    // somebody already found serves nobody.
    await createMissingReport(reporter.id, { status: "resolved", fullName: "Resolved Person" });

    const feed = await listMissingFeed({}, { offset: 0, limit: 20 }, null);
    const names = feed.items.map((item) => item.fullName).sort();

    expect(names).toEqual(["Matched Person", "Published Person"]);
    expect(feed.total).toBe(2);
  });

  it("filters by city, case-insensitively and by substring", async () => {
    const reporter = await createUser();
    await createMissingReport(reporter.id, { status: "published", lastSeenCity: "Lahore" });
    await createMissingReport(reporter.id, { status: "published", lastSeenCity: "Karachi" });

    const exact = await listMissingFeed({ city: "lahore" }, { offset: 0, limit: 20 }, null);
    expect(exact.total).toBe(1);

    const partial = await listMissingFeed({ city: "hor" }, { offset: 0, limit: 20 }, null);
    expect(partial.total).toBe(1);
  });

  it("searches names and descriptions", async () => {
    const reporter = await createUser();
    await createMissingReport(reporter.id, { status: "published", fullName: "Aisha Khan" });
    await createMissingReport(reporter.id, {
      status: "published",
      fullName: "Omar Farooq",
      clothingDescription: "Bright red jacket",
    });

    expect((await listMissingFeed({ query: "aisha" }, { offset: 0, limit: 20 }, null)).total).toBe(1);
    // The description is searched too, because "red jacket" is often what a
    // stranger actually remembers.
    expect((await listMissingFeed({ query: "red jacket" }, { offset: 0, limit: 20 }, null)).total).toBe(1);
    expect((await listMissingFeed({ query: "nobody" }, { offset: 0, limit: 20 }, null)).total).toBe(0);
  });

  it("filters missing reports by an age range", async () => {
    const reporter = await createUser();
    await createMissingReport(reporter.id, { status: "published", age: 8 });
    await createMissingReport(reporter.id, { status: "published", age: 34 });
    await createMissingReport(reporter.id, { status: "published", age: 70 });

    const result = await listMissingFeed({ minAge: 30, maxAge: 40 }, { offset: 0, limit: 20 }, null);
    expect(result.total).toBe(1);
  });

  it("treats a found report's unknown age bound as not excluding it", async () => {
    // Somebody searching for a 70-year-old should still see a case recorded
    // only as "60 or older" — an unknown bound is unknown, not disqualifying.
    const reporter = await createUser();
    await createFoundReport(reporter.id, {
      status: "published",
      estimatedAgeMin: 60,
      estimatedAgeMax: null,
    });

    const result = await listFoundFeed({ minAge: 68, maxAge: 72 }, { offset: 0, limit: 20 }, null);
    expect(result.total).toBe(1);
  });

  it("excludes a found report whose range cannot overlap the filter", async () => {
    const reporter = await createUser();
    await createFoundReport(reporter.id, {
      status: "published",
      estimatedAgeMin: 10,
      estimatedAgeMax: 15,
    });

    const result = await listFoundFeed({ minAge: 60, maxAge: 80 }, { offset: 0, limit: 20 }, null);
    expect(result.total).toBe(0);
  });

  it("paginates without losing or repeating a case", async () => {
    const reporter = await createUser();
    for (let index = 0; index < 5; index += 1) {
      await createMissingReport(reporter.id, {
        status: "published",
        fullName: `Person ${index}`,
      });
    }

    const first = await listMissingFeed({}, { offset: 0, limit: 2 }, null);
    const second = await listMissingFeed({}, { offset: 2, limit: 2 }, null);

    expect(first.total).toBe(5);
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(2);
    const ids = new Set([...first.items, ...second.items].map((item) => item.id));
    expect(ids.size).toBe(4);
  });

  it("never selects private columns on a public feed read", async () => {
    const reporter = await createUser();
    await createMissingReport(reporter.id, { status: "published" });

    const feed = await listMissingFeed({}, { offset: 0, limit: 20 }, null);
    const serialised = JSON.stringify(feed.items);

    // These values are in the row; they must not leave Postgres on this path.
    expect(serialised).not.toContain("+92 300 1234567");
    expect(serialised).not.toContain("FIR-2026-1");
  });
});

describeDb("a reporter's own view", () => {
  it("lists their reports at every status, with private fields", async () => {
    const reporter = await createUser();
    await createMissingReport(reporter.id, { status: "pending" });
    await createMissingReport(reporter.id, { status: "rejected" });
    await createFoundReport(reporter.id, { status: "published" });

    const mine = await listMyReports(reporter.id, reporter);
    expect(mine.missing).toHaveLength(2);
    expect(mine.found).toHaveLength(1);
    // Their own contact details are theirs to see.
    expect(mine.missing[0]).toHaveProperty("contactPhone");
  });

  it("does not include anybody else's reports", async () => {
    const reporter = await createUser();
    const other = await createUser();
    await createMissingReport(other.id, { status: "published" });

    const mine = await listMyReports(reporter.id, reporter);
    expect(mine.missing).toHaveLength(0);
  });
});

describeDb("matching", () => {
  async function publishedPair() {
    const reporterA = await createUser();
    const reporterB = await createUser();
    const reviewer = await createUser({ role: "admin" });

    const missing = await createMissingReport(reporterA.id, { status: "published" });
    const found = await createFoundReport(reporterB.id, { status: "published" });

    return { reporterA, reporterB, reviewer, missing, found };
  }

  it("links a pair, moves both to matched, and tells both reporters", async () => {
    const { reporterA, reporterB, reviewer, missing, found } = await publishedPair();

    const match = await createMatch(reviewer, {
      missingReportId: missing.id,
      foundReportId: found.id,
      notes: "Same city and a matching description.",
    });

    const [matchRow] = await getDb().select().from(matches).where(eq(matches.id, match.id));
    expect(matchRow?.status).toBe("possible");
    // Nothing writes `automated` today; a human made this link.
    expect(matchRow?.source).toBe("manual_review");
    expect(matchRow?.confidenceScore).toBeNull();
    expect(matchRow?.createdBy).toBe(reviewer.id);

    const [missingRow] = await getDb()
      .select()
      .from(missingPersonReports)
      .where(eq(missingPersonReports.id, missing.id));
    const [foundRow] = await getDb()
      .select()
      .from(foundPersonReports)
      .where(eq(foundPersonReports.id, found.id));
    expect(missingRow?.status).toBe("matched");
    expect(foundRow?.status).toBe("matched");

    // Both families told, and told it is unconfirmed.
    for (const reporter of [reporterA, reporterB]) {
      const alerts = await listForUser(reporter.id);
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.type).toBe("possible_match_found");
      expect(alerts[0]?.body).toMatch(/nothing is confirmed/i);
    }
  });

  it("does not notify the same person twice when they filed both reports", async () => {
    // One person can plausibly file both, and sending the same alert twice
    // would be a small cruelty.
    const reporter = await createUser();
    const reviewer = await createUser({ role: "admin" });
    const missing = await createMissingReport(reporter.id, { status: "published" });
    const found = await createFoundReport(reporter.id, { status: "published" });

    await createMatch(reviewer, {
      missingReportId: missing.id,
      foundReportId: found.id,
      notes: null,
    });

    expect(await listForUser(reporter.id)).toHaveLength(1);
  });

  it("resolves both cases and removes them from the feed when confirmed", async () => {
    const { reporterA, reviewer, missing, found } = await publishedPair();

    const match = await createMatch(reviewer, {
      missingReportId: missing.id,
      foundReportId: found.id,
      notes: null,
    });
    await decideMatch(reviewer, match.id, { status: "confirmed", notes: "Identity confirmed." });

    const [missingRow] = await getDb()
      .select()
      .from(missingPersonReports)
      .where(eq(missingPersonReports.id, missing.id));
    expect(missingRow?.status).toBe("resolved");

    const feed = await listMissingFeed({}, { offset: 0, limit: 20 }, null);
    expect(feed.items).toHaveLength(0);

    const alerts = await listForUser(reporterA.id);
    expect(alerts.map((alert) => alert.type)).toContain("match_confirmed");
  });

  it("puts both cases back on the feed when a match is dismissed", async () => {
    // The behaviour that is easy to omit and expensive to omit: without it a
    // wrongly-linked pair stays in `matched` forever, off the public feed so
    // nobody can recognise the person, with no legal move left for a reviewer.
    const { reporterA, reviewer, missing, found } = await publishedPair();

    const match = await createMatch(reviewer, {
      missingReportId: missing.id,
      foundReportId: found.id,
      notes: null,
    });
    await decideMatch(reviewer, match.id, { status: "dismissed", notes: "Different height." });

    const [missingRow] = await getDb()
      .select()
      .from(missingPersonReports)
      .where(eq(missingPersonReports.id, missing.id));
    const [foundRow] = await getDb()
      .select()
      .from(foundPersonReports)
      .where(eq(foundPersonReports.id, found.id));

    expect(missingRow?.status).toBe("published");
    expect(foundRow?.status).toBe("published");

    const feed = await listMissingFeed({}, { offset: 0, limit: 20 }, null);
    expect(feed.items).toHaveLength(1);

    // And the family is told the possibility was checked and ruled out — they
    // have been waiting on it since the link was made.
    const alerts = await listForUser(reporterA.id);
    expect(alerts.map((alert) => alert.type)).toContain("match_dismissed");
  });

  it("records every match decision in the audit trail", async () => {
    const { reviewer, missing, found } = await publishedPair();

    const match = await createMatch(reviewer, {
      missingReportId: missing.id,
      foundReportId: found.id,
      notes: null,
    });
    await decideMatch(reviewer, match.id, { status: "confirmed", notes: null });

    const actions = (await getDb().select().from(auditLogs)).map((entry) => entry.action);
    expect(actions).toContain("match.created");
    expect(actions).toContain("match.confirmed");
  });

  it("lists open matches for the console", async () => {
    const { reviewer, missing, found } = await publishedPair();
    await createMatch(reviewer, { missingReportId: missing.id, foundReportId: found.id, notes: null });

    const open = await listMatches("possible");
    expect(open).toHaveLength(1);
    expect(open[0]?.missing.fullName).toBe("Aisha Khan");
    expect(open[0]?.found.city).toBe("Lahore");
  });
});

describeDb("candidate suggestions", () => {
  it("ranks a same-city, age-consistent report above an unrelated one", async () => {
    const reporter = await createUser();
    const missing = await createMissingReport(reporter.id, {
      status: "published",
      age: 12,
      gender: "female",
      lastSeenCity: "Lahore",
      lastSeenAt: new Date("2026-08-01T00:00:00Z"),
    });

    await createFoundReport(reporter.id, {
      status: "published",
      foundCity: "Karachi",
      gender: "male",
      estimatedAgeMin: 60,
      estimatedAgeMax: 75,
      foundAt: new Date("2026-07-01T00:00:00Z"),
    });
    const strong = await createFoundReport(reporter.id, {
      status: "published",
      foundCity: "Lahore",
      gender: "female",
      estimatedAgeMin: 10,
      estimatedAgeMax: 14,
      foundAt: new Date("2026-08-03T00:00:00Z"),
    });

    const candidates = await suggestCandidates(missing.id);
    expect(candidates[0]?.foundReportId).toBe(strong.id);
    // Every contribution is explained, so a reviewer can see the ranking is
    // about the city and the age rather than treating the number as a
    // likelihood.
    expect(candidates[0]?.reasons.join(" ")).toMatch(/Lahore/);
    expect(candidates[0]?.reasons.length).toBeGreaterThan(2);
  });

  it("excludes a report already linked to this case", async () => {
    const reporter = await createUser();
    const reviewer = await createUser({ role: "admin" });
    const missing = await createMissingReport(reporter.id, { status: "published" });
    const found = await createFoundReport(reporter.id, { status: "published" });

    expect(await suggestCandidates(missing.id)).toHaveLength(1);

    await createMatch(reviewer, { missingReportId: missing.id, foundReportId: found.id, notes: null });

    expect(await suggestCandidates(missing.id)).toHaveLength(0);
  });

  it("never suggests an unreviewed or declined report", async () => {
    const reporter = await createUser();
    const missing = await createMissingReport(reporter.id, { status: "published" });
    await createFoundReport(reporter.id, { status: "pending" });
    await createFoundReport(reporter.id, { status: "rejected" });

    expect(await suggestCandidates(missing.id)).toHaveLength(0);
  });
});

describeDb("review queue counts", () => {
  it("counts exactly the work waiting for a reviewer", async () => {
    const reporter = await createUser();
    const reviewer = await createUser({ role: "admin" });

    await createMissingReport(reporter.id, { status: "pending" });
    await createMissingReport(reporter.id, { status: "under_review" });
    await createMissingReport(reporter.id, { status: "published" });
    await createFoundReport(reporter.id, { status: "pending" });

    const published = await createMissingReport(reporter.id, { status: "published" });
    const foundPublished = await createFoundReport(reporter.id, { status: "published" });
    await createMatch(reviewer, {
      missingReportId: published.id,
      foundReportId: foundPublished.id,
      notes: null,
    });

    const counts = await reviewQueueCounts();
    expect(counts.pendingMissing).toBe(2);
    expect(counts.pendingFound).toBe(1);
    expect(counts.possibleMatches).toBe(1);
    expect(counts.openAbuseReports).toBe(0);
  });
});

describeDb("notification hygiene", () => {
  it("never stores an off-site link", async () => {
    // `href` is rendered as a link the recipient trusts because it came from
    // Locora. An absolute URL would be an open redirect wearing the platform's
    // credibility.
    const { notify } = await import("@/server/notifications/service");
    const user = await createUser();

    await notify(getDb(), {
      userId: user.id,
      type: "account_security",
      title: "Test",
      body: "Test",
      href: "https://evil.example/steal",
    });
    await notify(getDb(), {
      userId: user.id,
      type: "account_security",
      title: "Protocol relative",
      body: "Test",
      href: "//evil.example/steal",
    });

    const rows = await getDb().select().from(notifications).where(eq(notifications.userId, user.id));
    for (const row of rows) {
      expect(row.href).toBeNull();
    }
  });
});
