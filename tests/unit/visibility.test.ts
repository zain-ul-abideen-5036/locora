import { describe, expect, it } from "vitest";

import { REPORT_STATUSES, type ReportStatus } from "@/db/enums";
import type { CurrentUser } from "@/server/auth/current-user";
import { AppError } from "@/server/http/errors";
import {
  assertCanViewReport,
  canViewOwnerDetails,
  canViewReport,
  type FoundRow,
  isPubliclyVisible,
  type MissingRow,
  projectFound,
  projectMissing,
  toOwnerFound,
  toOwnerMissing,
  toPublicFound,
  toPublicMissing,
} from "@/server/reports/visibility";

/**
 * The privacy core.
 *
 * This is the most important test file in the project. Everything it asserts is
 * a promise the product makes on its own safety page, and every one of those
 * promises is one line of code away from being broken by an ordinary-looking
 * refactor.
 *
 * The tests are written against the *serialised output*, not against the
 * functions' intent. A test that checked "the public projection was called"
 * would still pass if that projection started leaking a field. These check that
 * specific keys are absent from the object that would go on the wire.
 */

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const STRANGER_ID = "22222222-2222-4222-8222-222222222222";

function user(id: string, role: "user" | "admin" = "user"): CurrentUser {
  return {
    id,
    email: "someone@example.com",
    fullName: "Someone",
    role,
    isEmailVerified: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
}

const owner = user(OWNER_ID);
const stranger = user(STRANGER_ID);
const reviewer = user("33333333-3333-4333-8333-333333333333", "admin");

/** A row as the database returns it, private columns included. */
function missingRow(status: ReportStatus = "published"): MissingRow {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    reporterId: OWNER_ID,
    fullName: "Aisha Khan",
    age: 12,
    gender: "female",
    heightCm: 140,
    clothingDescription: "Navy school uniform",
    distinguishingFeatures: "Scar above left eyebrow",
    lastSeenAddress: "Near Liberty Market",
    lastSeenCity: "Lahore",
    lastSeenLatitude: 31.5204,
    lastSeenLongitude: 74.3587,
    lastSeenAt: new Date("2026-08-01T14:30:00Z"),
    status,
    createdAt: new Date("2026-08-01T15:00:00Z"),
    updatedAt: new Date("2026-08-02T09:00:00Z"),
    // The fields that must never reach a stranger.
    contactName: "Farah Siddiqui",
    contactPhone: "+92 300 1234567",
    contactEmail: "bilal@example.com",
    policeReportNumber: "FIR-2026-8891",
    reviewNotes: "Verified against the police reference.",
    reviewedAt: new Date("2026-08-02T09:00:00Z"),
  };
}

function foundRow(status: ReportStatus = "published"): FoundRow {
  return {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    reporterId: OWNER_ID,
    estimatedAgeMin: 60,
    estimatedAgeMax: 75,
    gender: "male",
    heightCm: 168,
    distinguishingFeatures: "Walks with a stick",
    notes: "Found disoriented at the bus terminal",
    foundAddress: "Cantt bus terminal",
    foundCity: "Karachi",
    foundLatitude: 24.8607,
    foundLongitude: 67.0011,
    foundAt: new Date("2026-08-20T08:00:00Z"),
    status,
    createdAt: new Date("2026-08-20T09:00:00Z"),
    updatedAt: new Date("2026-08-20T09:00:00Z"),
    // The single most sensitive field in the schema.
    currentWhereabouts: "Taken to the district hospital by police",
    contactName: "Sara Ahmed",
    contactPhone: "+92 301 9876543",
    contactEmail: "sara@example.com",
    reviewNotes: "Confirmed by phone.",
    reviewedAt: new Date("2026-08-20T09:00:00Z"),
  };
}

const reporter = { fullName: "Bilal Khan" };
const photos = [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", blobUrl: "https://example.test/a.jpg" }];

// ---------------------------------------------------------------------------
// Field-level redaction
// ---------------------------------------------------------------------------

/** Every column on a missing report that a stranger must never receive. */
const PRIVATE_MISSING_KEYS = [
  "contactName",
  "contactPhone",
  "contactEmail",
  "policeReportNumber",
  "reviewNotes",
  "reviewedAt",
] as const;

const PRIVATE_FOUND_KEYS = [
  "currentWhereabouts",
  "contactName",
  "contactPhone",
  "contactEmail",
  "reviewNotes",
  "reviewedAt",
] as const;

describe("public projection of a missing-person report", () => {
  const view = toPublicMissing(missingRow(), reporter, photos, stranger);

  it("omits every private key", () => {
    for (const key of PRIVATE_MISSING_KEYS) {
      expect(view, `public view must not carry ${key}`).not.toHaveProperty(key);
    }
  });

  it("carries no private value anywhere in its serialised form", () => {
    // The stronger assertion. A nested object, a stray spread, or a field
    // renamed but still populated would pass the key check above and fail here.
    const serialised = JSON.stringify(view);
    for (const secret of [
      "Farah Siddiqui",
      "+92 300 1234567",
      "bilal@example.com",
      "FIR-2026-8891",
      "Verified against the police reference.",
    ]) {
      expect(serialised, `public view leaked "${secret}"`).not.toContain(secret);
    }
  });

  it("still carries what makes the case recognisable", () => {
    // Redaction that removed the useful half would be equally wrong: the point
    // of a public case is that a stranger can recognise the person.
    expect(view.fullName).toBe("Aisha Khan");
    expect(view.age).toBe(12);
    expect(view.lastSeenCity).toBe("Lahore");
    expect(view.photos).toHaveLength(1);
    expect(view.reporter.displayName).toBe("Bilal Khan");
  });

  it("exposes the reporter's display name but nothing else about their account", () => {
    expect(Object.keys(view.reporter)).toEqual(["displayName"]);
  });

  it("publishes the reporter's display name while withholding the contact name", () => {
    // These are deliberately different things. A case is not anonymous — the
    // display name is published so a report has somebody's name attached to it —
    // but the contact block, including the contact name, is private. The two are
    // separate values in the fixture precisely so this distinction is testable.
    expect(view.reporter.displayName).toBe("Bilal Khan");
    expect(view).not.toHaveProperty("contactName");
  });
});

describe("public projection of a found-person report", () => {
  const view = toPublicFound(foundRow(), reporter, photos, stranger);

  it("omits every private key, including where the person is now", () => {
    for (const key of PRIVATE_FOUND_KEYS) {
      expect(view, `public view must not carry ${key}`).not.toHaveProperty(key);
    }
  });

  it("carries no private value anywhere in its serialised form", () => {
    const serialised = JSON.stringify(view);
    for (const secret of [
      "Taken to the district hospital by police",
      "Sara Ahmed",
      "+92 301 9876543",
      "sara@example.com",
      "Confirmed by phone.",
    ]) {
      expect(serialised, `public view leaked "${secret}"`).not.toContain(secret);
    }
  });

  it("keeps the age as a range rather than collapsing it to a number", () => {
    expect(view.estimatedAgeMin).toBe(60);
    expect(view.estimatedAgeMax).toBe(75);
  });
});

describe("owner projection", () => {
  it("adds the private fields for a missing report", () => {
    const view = toOwnerMissing(missingRow(), reporter, photos, owner);
    expect(view.contactName).toBe("Farah Siddiqui");
    expect(view.contactPhone).toBe("+92 300 1234567");
    expect(view.policeReportNumber).toBe("FIR-2026-8891");
    expect(view.reviewNotes).toBe("Verified against the police reference.");
  });

  it("adds the private fields for a found report", () => {
    const view = toOwnerFound(foundRow(), reporter, photos, owner);
    expect(view.currentWhereabouts).toBe("Taken to the district hospital by police");
    expect(view.contactPhone).toBe("+92 301 9876543");
  });
});

// ---------------------------------------------------------------------------
// Choosing the projection
// ---------------------------------------------------------------------------

describe("projectMissing picks the right view for the viewer", () => {
  it("gives an anonymous visitor the public view", () => {
    const view = projectMissing(missingRow(), reporter, photos, null);
    expect(view).not.toHaveProperty("contactPhone");
    expect(view.viewerIsOwner).toBe(false);
    expect(view.viewerIsReviewer).toBe(false);
  });

  it("gives a signed-in stranger the public view", () => {
    // Being signed in is not itself an entitlement to anything.
    const view = projectMissing(missingRow(), reporter, photos, stranger);
    expect(view).not.toHaveProperty("contactPhone");
  });

  it("gives the owner the owner view", () => {
    const view = projectMissing(missingRow(), reporter, photos, owner);
    expect(view).toHaveProperty("contactPhone");
    expect(view.viewerIsOwner).toBe(true);
  });

  it("gives a reviewer the owner view", () => {
    const view = projectMissing(missingRow(), reporter, photos, reviewer);
    expect(view).toHaveProperty("contactPhone");
    expect(view.viewerIsReviewer).toBe(true);
    // A reviewer is not the owner, and the UI uses that distinction to decide
    // which actions to offer.
    expect(view.viewerIsOwner).toBe(false);
  });
});

describe("projectFound picks the right view for the viewer", () => {
  it("withholds where the person is now from a stranger", () => {
    const view = projectFound(foundRow(), reporter, photos, stranger);
    expect(view).not.toHaveProperty("currentWhereabouts");
  });

  it("shows it to a reviewer, who needs it to reunite them", () => {
    const view = projectFound(foundRow(), reporter, photos, reviewer);
    expect(view).toHaveProperty("currentWhereabouts");
  });
});

// ---------------------------------------------------------------------------
// Record-level visibility
// ---------------------------------------------------------------------------

describe("canViewOwnerDetails", () => {
  it("is true for the owner and for a reviewer, and false otherwise", () => {
    expect(canViewOwnerDetails(OWNER_ID, owner)).toBe(true);
    expect(canViewOwnerDetails(OWNER_ID, reviewer)).toBe(true);
    expect(canViewOwnerDetails(OWNER_ID, stranger)).toBe(false);
    expect(canViewOwnerDetails(OWNER_ID, null)).toBe(false);
  });
});

describe("isPubliclyVisible", () => {
  it("covers exactly the three statuses a stranger may see", () => {
    const publiclyVisible = REPORT_STATUSES.filter(isPubliclyVisible);
    expect(publiclyVisible).toEqual(["published", "matched", "resolved"]);
  });

  it("excludes every unreviewed or declined status", () => {
    // A declined report may have been declined *because* its content was
    // abusive. It has to stop being readable the moment that decision is made.
    expect(isPubliclyVisible("pending")).toBe(false);
    expect(isPubliclyVisible("under_review")).toBe(false);
    expect(isPubliclyVisible("rejected")).toBe(false);
  });
});

describe("canViewReport", () => {
  it("lets anyone see a published, matched or resolved case", () => {
    for (const status of ["published", "matched", "resolved"] as const) {
      expect(canViewReport({ reporterId: OWNER_ID, status }, null), status).toBe(true);
      expect(canViewReport({ reporterId: OWNER_ID, status }, stranger), status).toBe(true);
    }
  });

  it("hides an unreviewed or declined case from a stranger", () => {
    for (const status of ["pending", "under_review", "rejected"] as const) {
      expect(canViewReport({ reporterId: OWNER_ID, status }, null), status).toBe(false);
      expect(canViewReport({ reporterId: OWNER_ID, status }, stranger), status).toBe(false);
    }
  });

  it("shows an unreviewed or declined case to its owner and to a reviewer", () => {
    for (const status of ["pending", "under_review", "rejected"] as const) {
      expect(canViewReport({ reporterId: OWNER_ID, status }, owner), status).toBe(true);
      expect(canViewReport({ reporterId: OWNER_ID, status }, reviewer), status).toBe(true);
    }
  });
});

describe("assertCanViewReport", () => {
  it("refuses with a 404, not a 403", () => {
    // The status code is the point: a 403 confirms a case with this id exists,
    // which is itself information about a case the caller may not see.
    try {
      assertCanViewReport({ reporterId: OWNER_ID, status: "pending" }, stranger);
      throw new Error("expected assertCanViewReport to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(404);
      // And the message must not distinguish "hidden" from "does not exist".
      expect((error as AppError).message).toMatch(/could not be found/i);
    }
  });

  it("permits a viewer who is entitled to the case", () => {
    expect(() =>
      assertCanViewReport({ reporterId: OWNER_ID, status: "pending" }, owner),
    ).not.toThrow();
  });
});
