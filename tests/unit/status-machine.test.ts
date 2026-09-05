import { describe, expect, it } from "vitest";

import { REPORT_STATUSES, type ReportStatus } from "@/db/enums";
import { AppError } from "@/server/http/errors";
import {
  allowedTransitions,
  assertReviewNotes,
  assertTransition,
  canTransition,
  shouldNotifyReporter,
} from "@/server/reports/status";

/**
 * The status machine.
 *
 * Tested exhaustively rather than by example, because a wrong edge here does
 * not throw — it strands a case in a state nothing can move it out of, which on
 * this platform means a missing person invisible on the feed and untouchable by
 * a reviewer. That failure is silent, so the test has to be the thing that
 * catches it.
 */
describe("report status transitions", () => {
  it("permits every transition the review console offers", () => {
    // Each of these is a button a reviewer can press. If one stops being legal,
    // the console offers an action that fails.
    const expected: [ReportStatus, ReportStatus][] = [
      ["pending", "under_review"],
      ["pending", "published"],
      ["pending", "rejected"],
      ["under_review", "published"],
      ["under_review", "rejected"],
      ["published", "matched"],
      ["published", "resolved"],
      ["matched", "resolved"],
      // The one that is easy to omit and expensive to omit: dismissing a match
      // has to be able to put both reports back on the feed.
      ["matched", "published"],
      ["rejected", "pending"],
    ];

    for (const [from, to] of expected) {
      expect(canTransition(from, to), `${from} -> ${to} should be allowed`).toBe(true);
    }
  });

  it("treats resolved as terminal", () => {
    for (const status of REPORT_STATUSES) {
      expect(canTransition("resolved", status), `resolved -> ${status}`).toBe(false);
    }
    expect(allowedTransitions("resolved")).toEqual([]);
  });

  it("lets a rejection be reopened, but only back into the queue", () => {
    // A moderation mistake has to be recoverable, but reversing it should send
    // the report back for review rather than straight onto the public feed.
    expect(allowedTransitions("rejected")).toEqual(["pending"]);
    expect(canTransition("rejected", "published")).toBe(false);
  });

  it("never allows a status to transition to itself", () => {
    for (const status of REPORT_STATUSES) {
      expect(canTransition(status, status), `${status} -> ${status}`).toBe(false);
    }
  });

  it("never allows an unreviewed report to reach resolved or matched", () => {
    // Both would imply a case had been published and acted on. Reaching either
    // from the queue would mean a case marked "reunited" that no reviewer ever
    // approved.
    for (const from of ["pending", "under_review"] as const) {
      expect(canTransition(from, "resolved"), `${from} -> resolved`).toBe(false);
      expect(canTransition(from, "matched"), `${from} -> matched`).toBe(false);
    }
  });

  it("keeps every reachable status escapable, so no case can be stranded", () => {
    // The property that actually matters. Every non-terminal status must have at
    // least one legal move out of it, or a case that lands there is stuck with
    // no action any reviewer can take.
    for (const status of REPORT_STATUSES) {
      if (status === "resolved") continue;
      expect(allowedTransitions(status).length, `${status} has no way out`).toBeGreaterThan(0);
    }
  });

  it("only ever reports transitions that are in the declared table", () => {
    // Guards against `canTransition` returning true for something
    // `allowedTransitions` does not list — the console renders from the latter
    // and the service enforces the former, so a disagreement is a bug that
    // shows up as a button that does not work.
    for (const from of REPORT_STATUSES) {
      const allowed = new Set(allowedTransitions(from));
      for (const to of REPORT_STATUSES) {
        expect(canTransition(from, to)).toBe(allowed.has(to));
      }
    }
  });
});

describe("assertTransition", () => {
  it("does not throw for a legal move", () => {
    expect(() => assertTransition("pending", "published")).not.toThrow();
  });

  it("throws a 400 naming both states", () => {
    try {
      assertTransition("published", "pending");
      throw new Error("expected assertTransition to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.status).toBe(400);
      expect(appError.message).toContain("published");
      expect(appError.message).toContain("pending");
    }
  });

  it("explains that a resolved case is closed rather than listing empty options", () => {
    try {
      assertTransition("resolved", "published");
      throw new Error("expected assertTransition to throw");
    } catch (error) {
      // A reviewer seeing "can only be moved to: " with nothing after it learns
      // nothing. This path says the case is resolved.
      expect((error as AppError).message).toMatch(/resolved and cannot be reopened/i);
    }
  });

  it("says so plainly when the report is already in the target state", () => {
    try {
      assertTransition("published", "published");
      throw new Error("expected assertTransition to throw");
    } catch (error) {
      expect((error as AppError).message).toMatch(/already published/i);
    }
  });
});

describe("assertReviewNotes", () => {
  it("requires a substantive note when declining", () => {
    expect(() => assertReviewNotes("rejected", null)).toThrow(AppError);
    expect(() => assertReviewNotes("rejected", "")).toThrow(AppError);
    // Short enough to be useless to the reporter, who is shown this verbatim.
    expect(() => assertReviewNotes("rejected", "no")).toThrow(AppError);
    expect(() => assertReviewNotes("rejected", "        ")).toThrow(AppError);
  });

  it("accepts a note that actually explains something", () => {
    expect(() =>
      assertReviewNotes("rejected", "We could not verify this. Please add a police reference."),
    ).not.toThrow();
  });

  it("does not require a note for any other decision", () => {
    for (const status of REPORT_STATUSES) {
      if (status === "rejected") continue;
      expect(() => assertReviewNotes(status, null), status).not.toThrow();
    }
  });
});

describe("shouldNotifyReporter", () => {
  it("notifies on the outcomes a reporter is waiting for", () => {
    expect(shouldNotifyReporter("published")).toBe(true);
    expect(shouldNotifyReporter("rejected")).toBe(true);
    expect(shouldNotifyReporter("resolved")).toBe(true);
  });

  it("stays quiet on internal review steps", () => {
    // `under_review` may be set several times as a reviewer works a queue.
    // Notifying each time trains people to ignore Locora's notifications, which
    // then costs them the one saying a possible match was found.
    expect(shouldNotifyReporter("under_review")).toBe(false);
    expect(shouldNotifyReporter("pending")).toBe(false);
    expect(shouldNotifyReporter("matched")).toBe(false);
  });
});
