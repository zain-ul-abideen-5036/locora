/**
 * The report status machine.
 *
 * Kept in its own module, free of database and HTTP concerns, because the
 * transition rules are the part most worth testing exhaustively and the part
 * where a mistake is least visible. A wrong rule here does not throw — it
 * quietly strands a case in a state nothing can move it out of, which on this
 * platform means a missing person who is invisible on the feed and whom no
 * reviewer can act on.
 *
 * ```
 *                    ┌──────────────► rejected ◄──────────┐
 *                    │                                    │
 *   pending ──► under_review ──► published ──► matched ────┤
 *      │                            │  ▲         │        │
 *      └────────────────────────────┘  └─────────┘        │
 *                                          │              │
 *                                          ▼              │
 *                                      resolved ◄─────────┘
 * ```
 *
 * Notable edges, and why:
 *
 * - `pending → published` exists, so a reviewer looking at an obviously genuine
 *   report does not have to click through an intermediate state.
 * - `matched → published` exists, and is what dismissing a match uses. Without
 *   it, a wrongly-flagged link would leave both reports stuck in `matched`:
 *   off the public feed, so nobody can recognise the person, and with no legal
 *   move available to a reviewer.
 * - `resolved` is terminal, and `rejected` is terminal-but-reopenable. A closed
 *   case should not silently come back, but a report rejected in error must be
 *   recoverable or a moderation mistake becomes permanent.
 */
import type { ReportStatus } from "@/db/enums";
import { badRequest } from "@/server/http/errors";

const TRANSITIONS: Record<ReportStatus, ReadonlySet<ReportStatus>> = {
  pending: new Set<ReportStatus>(["under_review", "published", "rejected"]),
  under_review: new Set<ReportStatus>(["published", "rejected", "pending"]),
  published: new Set<ReportStatus>(["matched", "resolved", "rejected", "under_review"]),
  matched: new Set<ReportStatus>(["published", "resolved", "rejected"]),
  resolved: new Set<ReportStatus>([]),
  // Reopening a rejection returns it to the queue rather than straight to the
  // feed, so the decision gets looked at again rather than reversed in one click.
  rejected: new Set<ReportStatus>(["pending"]),
};

export function canTransition(from: ReportStatus, to: ReportStatus): boolean {
  return TRANSITIONS[from].has(to);
}

/** The statuses a reviewer may move this report to, for rendering the actions available. */
export function allowedTransitions(from: ReportStatus): ReportStatus[] {
  return [...TRANSITIONS[from]];
}

/**
 * Throws a 400 explaining the refusal, in terms a reviewer can act on.
 *
 * The message names both states and, for the terminal cases, says why there is
 * nothing to be done — otherwise the console offers an action that fails with
 * "invalid transition" and no indication of what would be valid.
 */
export function assertTransition(from: ReportStatus, to: ReportStatus): void {
  if (canTransition(from, to)) return;

  if (from === to) {
    throw badRequest(`This report is already ${humanise(from)}.`);
  }
  if (from === "resolved") {
    throw badRequest("This case is resolved and cannot be reopened.");
  }

  throw badRequest(
    `A report that is ${humanise(from)} cannot become ${humanise(to)}. ` +
      `From here it can only be moved to: ${allowedTransitions(from).map(humanise).join(", ")}.`,
  );
}

function humanise(status: ReportStatus): string {
  return status.replace(/_/g, " ");
}

/**
 * A rejection has to say why.
 *
 * The reporter is shown this note, and "your report about your missing daughter
 * was not published" with no explanation is not an acceptable thing for this
 * product to send. Enforced here rather than in the request schema because it
 * is conditional on the target status, which a schema for a single field cannot
 * see.
 */
export function assertReviewNotes(to: ReportStatus, notes: string | null): void {
  if (to === "rejected" && (!notes || notes.trim().length < 10)) {
    throw badRequest(
      "Rejecting a report requires a note of at least 10 characters. " +
        "The reporter is shown this, so it should explain what was wrong.",
    );
  }
}

/**
 * Whether moving to this status should notify the reporter.
 *
 * `under_review` deliberately does not. It is an internal step that may happen
 * several times as a reviewer works through a queue, and notifying on each one
 * trains people to ignore Locora's notifications — which then costs them the
 * one that says a possible match was found.
 */
export function shouldNotifyReporter(to: ReportStatus): boolean {
  return to === "published" || to === "rejected" || to === "resolved";
}
