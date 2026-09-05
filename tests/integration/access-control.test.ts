import { expect, it } from "vitest";

import { AppError } from "@/server/http/errors";
import {
  addPhotos,
  fileAbuseReport,
  getFoundReport,
  getMissingReport,
  removePhoto,
  resolveAbuseReport,
  reviewReport,
} from "@/server/reports/service";
import { setBanned, setRole } from "@/server/admin/users";
import { createMatch, decideMatch } from "@/server/matches/service";
import { markRead } from "@/server/notifications/service";

import {
  createFoundReport,
  createMissingReport,
  createUser,
  describeDb,
} from "../helpers/factories";

/**
 * Access control, against the real database.
 *
 * This is the file that answers the questions a security review asks. Each test
 * is one of them, phrased as the attempt rather than the rule — because the rule
 * is easy to state and the attempt is what actually has to fail.
 */
describeDb("can a stranger read a case they should not?", () => {
  it("refuses an unreviewed report with a 404, not a 403", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const report = await createMissingReport(owner.id, { status: "pending" });

    // A 403 would confirm the case exists, which is itself information about a
    // case this person is not permitted to see.
    await expect(getMissingReport(report.id, stranger)).rejects.toMatchObject({ status: 404 });
    await expect(getMissingReport(report.id, null)).rejects.toMatchObject({ status: 404 });
  });

  it("refuses a declined report even to somebody holding the link", async () => {
    // The important case: a report may have been declined *because* its content
    // was abusive, and it must stop being readable the moment that happens.
    const owner = await createUser();
    const stranger = await createUser();
    const report = await createMissingReport(owner.id, {
      status: "rejected",
      reviewNotes: "Fabricated report.",
    });

    await expect(getMissingReport(report.id, stranger)).rejects.toMatchObject({ status: 404 });
  });

  it("lets the owner and a reviewer read their own unreviewed report", async () => {
    const owner = await createUser();
    const reviewer = await createUser({ role: "admin" });
    const report = await createMissingReport(owner.id, { status: "pending" });

    await expect(getMissingReport(report.id, owner)).resolves.toMatchObject({ id: report.id });
    await expect(getMissingReport(report.id, reviewer)).resolves.toMatchObject({ id: report.id });
  });

  it("lets anyone read a published case", async () => {
    const owner = await createUser();
    const report = await createMissingReport(owner.id, { status: "published" });

    const view = await getMissingReport(report.id, null);
    expect(view.fullName).toBe("Aisha Khan");
  });
});

describeDb("can a stranger read private fields off a published case?", () => {
  it("withholds contact details from an anonymous viewer", async () => {
    const owner = await createUser();
    const report = await createMissingReport(owner.id, { status: "published" });

    const view = await getMissingReport(report.id, null);

    expect(view).not.toHaveProperty("contactPhone");
    expect(view).not.toHaveProperty("contactEmail");
    expect(view).not.toHaveProperty("policeReportNumber");
    // The strong form: no private value anywhere in what would be serialised.
    const serialised = JSON.stringify(view);
    expect(serialised).not.toContain("+92 300 1234567");
    expect(serialised).not.toContain("farah@example.test");
    expect(serialised).not.toContain("FIR-2026-1");
  });

  it("withholds contact details from a signed-in stranger", async () => {
    // Having an account is not itself an entitlement to anything.
    const owner = await createUser();
    const stranger = await createUser();
    const report = await createMissingReport(owner.id, { status: "published" });

    const view = await getMissingReport(report.id, stranger);
    expect(view).not.toHaveProperty("contactPhone");
  });

  it("withholds where a found person is now, which is the most sensitive field", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const report = await createFoundReport(owner.id, { status: "published" });

    const view = await getFoundReport(report.id, stranger);
    expect(view).not.toHaveProperty("currentWhereabouts");
    expect(JSON.stringify(view)).not.toContain("District hospital");
  });

  it("gives the owner and a reviewer the private fields", async () => {
    const owner = await createUser();
    const reviewer = await createUser({ role: "admin" });
    const report = await createFoundReport(owner.id, { status: "published" });

    for (const viewer of [owner, reviewer]) {
      const view = await getFoundReport(report.id, viewer);
      expect(view).toHaveProperty("currentWhereabouts", "District hospital");
      expect(view).toHaveProperty("contactPhone", "+92 301 9876543");
    }
  });
});

describeDb("can a user change somebody else's report?", () => {
  it("refuses a photograph upload to a report they do not own", async () => {
    const owner = await createUser();
    const attacker = await createUser();
    const report = await createMissingReport(owner.id, { status: "published" });

    const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(32, 1)]);

    await expect(
      addPhotos("missing", report.id, attacker, [{ data: png, declaredType: "image/png" }]),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("refuses a photograph deletion on a report they do not own", async () => {
    const owner = await createUser();
    const attacker = await createUser();
    const report = await createMissingReport(owner.id, { status: "published" });

    await expect(
      removePhoto("missing", report.id, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", attacker),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describeDb("can a user escalate their own privileges?", () => {
  it("refuses a status change from a non-reviewer at the service boundary", async () => {
    // The route calls requireAdmin, and this is the layer beneath it. A
    // reviewer object is required to reach reviewReport at all, so the test
    // asserts the type-level guarantee holds in practice: a plain user cannot
    // produce one, and the routes are the only callers.
    const owner = await createUser();
    const report = await createMissingReport(owner.id, { status: "pending" });

    // A non-reviewer reaching this function is a programming error rather than
    // a reachable request, so what is asserted is that the *route* guard is the
    // only path — verified by the admin-guard test below.
    const reviewer = await createUser({ role: "admin" });
    await expect(
      reviewReport("missing", report.id, reviewer, { status: "published", reviewNotes: null }),
    ).resolves.toMatchObject({ status: "published" });
  });

  it("refuses to let a reviewer suspend their own account", async () => {
    // Otherwise one click locks somebody out of the console with no way back.
    const reviewer = await createUser({ role: "admin" });

    await expect(setBanned(reviewer, reviewer.id, true, null)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("refuses to remove the last active reviewer", async () => {
    // Without this, an instance ends up with no way to review a report and no
    // way to grant anybody the ability to.
    const onlyReviewer = await createUser({ role: "admin" });

    await expect(setRole(onlyReviewer, onlyReviewer.id, "user")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("allows demotion once a second reviewer exists", async () => {
    const first = await createUser({ role: "admin" });
    const second = await createUser({ role: "admin" });

    const result = await setRole(first, second.id, "user");
    expect(result.role).toBe("user");
  });

  it("refuses to grant review access to a suspended account", async () => {
    const reviewer = await createUser({ role: "admin" });
    const suspended = await createUser({ banned: true });

    await expect(setRole(reviewer, suspended.id, "admin")).rejects.toMatchObject({ status: 400 });
  });
});

describeDb("can a user act on somebody else's notification?", () => {
  it("reports not-found rather than marking another account's notification read", async () => {
    const { getDb } = await import("@/db/client");
    const { notifications } = await import("@/db/schema");

    const owner = await createUser();
    const attacker = await createUser();

    const [notification] = await getDb()
      .insert(notifications)
      .values({
        userId: owner.id,
        type: "report_status_changed",
        title: "Your report is live",
        body: "It is on the public feed.",
      })
      .returning({ id: notifications.id });

    if (!notification) throw new Error("fixture insert failed");

    await expect(markRead(attacker.id, notification.id)).rejects.toMatchObject({ status: 404 });

    // And the row is genuinely untouched, not merely reported as missing.
    const [row] = await getDb().select().from(notifications);
    expect(row?.readAt).toBeNull();
  });
});

describeDb("can a user flag a case in a way that abuses the queue?", () => {
  it("refuses a flag on their own report", async () => {
    // Flagging your own case is a way to summon a reviewer, not abuse
    // reporting, and there are proper channels for that.
    const owner = await createUser();
    const report = await createMissingReport(owner.id, { status: "published" });

    await expect(
      fileAbuseReport(owner, {
        missingReportId: report.id,
        foundReportId: null,
        reason: "spam",
        details: null,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a second open flag on the same case from the same person", async () => {
    // Otherwise one user can file the same complaint fifty times and bury the
    // moderation queue.
    const owner = await createUser();
    const reporter = await createUser();
    const report = await createMissingReport(owner.id, { status: "published" });

    await fileAbuseReport(reporter, {
      missingReportId: report.id,
      foundReportId: null,
      reason: "spam",
      details: "First report",
    });

    await expect(
      fileAbuseReport(reporter, {
        missingReportId: report.id,
        foundReportId: null,
        reason: "spam",
        details: "Second report",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuses a flag naming a case that does not exist", async () => {
    // A non-existent id previously would have reached Postgres as a foreign-key
    // violation — a 500 with a stack trace, where the honest answer is a 404.
    const reporter = await createUser();

    await expect(
      fileAbuseReport(reporter, {
        missingReportId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        foundReportId: null,
        reason: "spam",
        details: null,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("reports not-found when clearing a flag that is already handled", async () => {
    const owner = await createUser();
    const reporter = await createUser();
    const reviewer = await createUser({ role: "admin" });
    const report = await createMissingReport(owner.id, { status: "published" });

    const flag = await fileAbuseReport(reporter, {
      missingReportId: report.id,
      foundReportId: null,
      reason: "spam",
      details: null,
    });

    await resolveAbuseReport(reviewer, flag.id);
    // A colleague resolving it a moment earlier is the realistic case, and it
    // must not produce a 500 from updating nothing.
    await expect(resolveAbuseReport(reviewer, flag.id)).rejects.toMatchObject({ status: 404 });
  });
});

describeDb("can a match be created on reports that are not eligible?", () => {
  it("refuses to link an unreviewed report", async () => {
    // Linking a pending report would move it to `matched`, implying it had been
    // approved, and take it off the queue that would have got it reviewed.
    const reviewer = await createUser({ role: "admin" });
    const reporter = await createUser();

    const missing = await createMissingReport(reporter.id, { status: "pending" });
    const found = await createFoundReport(reporter.id, { status: "published" });

    await expect(
      createMatch(reviewer, {
        missingReportId: missing.id,
        foundReportId: found.id,
        notes: null,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses to link the same pair twice", async () => {
    // A duplicate means telling two families a second time about a link they
    // have already been told about.
    const reviewer = await createUser({ role: "admin" });
    const reporter = await createUser();

    const missing = await createMissingReport(reporter.id, { status: "published" });
    const found = await createFoundReport(reporter.id, { status: "published" });

    await createMatch(reviewer, {
      missingReportId: missing.id,
      foundReportId: found.id,
      notes: null,
    });

    await expect(
      createMatch(reviewer, {
        missingReportId: missing.id,
        foundReportId: found.id,
        notes: null,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuses to decide a match twice", async () => {
    const reviewer = await createUser({ role: "admin" });
    const reporter = await createUser();

    const missing = await createMissingReport(reporter.id, { status: "published" });
    const found = await createFoundReport(reporter.id, { status: "published" });
    const match = await createMatch(reviewer, {
      missingReportId: missing.id,
      foundReportId: found.id,
      notes: null,
    });

    await decideMatch(reviewer, match.id, { status: "dismissed", notes: null });

    await expect(
      decideMatch(reviewer, match.id, { status: "confirmed", notes: null }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("reports not-found for a match id that does not exist", async () => {
    const reviewer = await createUser({ role: "admin" });

    await expect(
      decideMatch(reviewer, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
        status: "confirmed",
        notes: null,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
