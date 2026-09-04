/**
 * Report validation.
 *
 * Every field a reporter can set is declared here, once, and the same schema
 * runs in the form and in the route handler. Two things are deliberately *not*
 * in these schemas and cannot be set by a client at all: `status` and
 * `reviewNotes`. A report's status is only ever moved by
 * src/server/reports/status.ts under a reviewer's authority, so there is no
 * shape of request body that can publish a report by asking nicely.
 */
import { z } from "zod";

import { GENDERS, REPORT_STATUSES } from "@/db/enums";

import { dateTimeSchema, optionalText, phoneSchema, requiredText } from "./common";

const genderSchema = z.enum(GENDERS, { message: "Please choose an option." });

const ageSchema = z.coerce
  .number({ message: "Please enter an age in years." })
  .int("Please enter a whole number of years.")
  .min(0, "Age cannot be negative.")
  .max(130, "Please enter an age under 130.");

const heightSchema = z.coerce
  .number()
  .int("Please enter a whole number of centimetres.")
  .min(30, "That height looks too small — enter centimetres, not metres.")
  .max(272, "Please enter a height under 272cm.")
  .optional()
  .nullable()
  .default(null);

/**
 * A latitude/longitude pair, or nothing.
 *
 * Coordinates are optional throughout: somebody filing in the first hours of a
 * disappearance may be unable to pin a map, and refusing the report over a
 * coordinate would be the wrong trade. But a half-set pair is meaningless, so
 * the two are validated together and the database enforces the same rule.
 */
const coordinatesSchema = z
  .object({
    latitude: z.coerce.number().min(-90).max(90).nullable().default(null),
    longitude: z.coerce.number().min(-180).max(180).nullable().default(null),
  })
  .refine(
    (value) => (value.latitude === null) === (value.longitude === null),
    { message: "Pick a point on the map, or clear it entirely.", path: ["latitude"] },
  );

const contactSchema = z.object({
  // These three are the fields the public API never returns. They are collected
  // because a reunification needs somebody reachable, and withheld because
  // publishing a phone number next to a missing child is how a family gets
  // targeted by hoax callers.
  contactName: requiredText(120, "Contact name"),
  contactPhone: phoneSchema,
  contactEmail: z
    .string()
    .trim()
    .max(254)
    .email("Please enter a valid email address.")
    .optional()
    .nullable()
    .default(null)
    .or(z.literal("").transform(() => null)),
});

export const missingReportSchema = z
  .object({
    fullName: requiredText(120, "The person's name"),
    age: ageSchema,
    gender: genderSchema,
    heightCm: heightSchema,
    clothingDescription: optionalText(1000),
    distinguishingFeatures: optionalText(1000),

    lastSeenAddress: requiredText(300, "Last seen location"),
    lastSeenCity: requiredText(120, "City"),
    lastSeenAt: dateTimeSchema,

    policeReportNumber: optionalText(80),
  })
  .and(coordinatesSchema)
  .and(contactSchema);

export const foundReportSchema = z
  .object({
    // An age range, because that is what an honest answer looks like for
    // somebody who cannot yet be identified.
    estimatedAgeMin: ageSchema.optional().nullable().default(null),
    estimatedAgeMax: ageSchema.optional().nullable().default(null),
    gender: genderSchema,
    heightCm: heightSchema,
    distinguishingFeatures: optionalText(1000),
    notes: optionalText(2000),

    foundAddress: requiredText(300, "Where they were found"),
    foundCity: requiredText(120, "City"),
    foundAt: dateTimeSchema,

    /** Owner and reviewer only — see the column comment in src/db/schema.ts. */
    currentWhereabouts: optionalText(500),
  })
  .and(coordinatesSchema)
  .and(contactSchema)
  .refine(
    (value) =>
      value.estimatedAgeMin === null ||
      value.estimatedAgeMax === null ||
      value.estimatedAgeMin <= value.estimatedAgeMax,
    { message: "The lowest age must not be above the highest.", path: ["estimatedAgeMin"] },
  );

export type MissingReportInput = z.infer<typeof missingReportSchema>;
export type FoundReportInput = z.infer<typeof foundReportSchema>;

/**
 * Public feed filters.
 *
 * Everything is optional and everything is lenient, because these arrive as
 * query parameters that people bookmark, share and edit by hand. A malformed
 * filter is dropped and the rest of the query still runs, rather than the page
 * failing.
 */
const looseString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? undefined : value))
    .optional()
    .catch(undefined);

const looseAge = z.coerce.number().int().min(0).max(130).optional().catch(undefined);
const looseDate = z.coerce
  .date()
  .refine((date) => !Number.isNaN(date.getTime()))
  .optional()
  .catch(undefined);

export const feedFiltersSchema = z.object({
  /** Free text over the person's name and description; ignored for found reports,
   *  which have no name to search. */
  query: looseString(120),
  city: looseString(120),
  gender: z.enum(GENDERS).optional().catch(undefined),
  minAge: looseAge,
  maxAge: looseAge,
  /** Bounds on when the person was last seen / found, not on when the report was filed. */
  dateFrom: looseDate,
  dateTo: looseDate,
  sort: z.enum(["newest", "oldest", "recently_seen"]).optional().catch(undefined),
});

export type FeedFilters = z.infer<typeof feedFiltersSchema>;

/** True when no filter is set, so the UI can tell "no results" from "no cases yet". */
export function hasActiveFilters(filters: FeedFilters): boolean {
  return Boolean(
    filters.query ||
      filters.city ||
      filters.gender ||
      filters.minAge !== undefined ||
      filters.maxAge !== undefined ||
      filters.dateFrom ||
      filters.dateTo,
  );
}

// ---------------------------------------------------------------------------
// Reviewer actions
// ---------------------------------------------------------------------------

/**
 * A status change requested by a reviewer.
 *
 * Which transitions are legal is not expressed here — a schema can say the
 * value is one of six strings, but not that `resolved` cannot become `pending`.
 * That belongs in src/server/reports/status.ts, where the current status is
 * known.
 */
export const reviewDecisionSchema = z.object({
  status: z.enum(REPORT_STATUSES),
  /** Required on a rejection: a reporter should never be told only "no". */
  reviewNotes: optionalText(1000),
});

export const createMatchSchema = z.object({
  missingReportId: z.string().uuid(),
  foundReportId: z.string().uuid(),
  notes: optionalText(1000),
});

export const matchDecisionSchema = z.object({
  status: z.enum(["confirmed", "dismissed"], {
    message: "A match can only be confirmed or dismissed.",
  }),
  notes: optionalText(1000),
});

export const abuseReportSchema = z
  .object({
    missingReportId: z.string().uuid().optional().nullable().default(null),
    foundReportId: z.string().uuid().optional().nullable().default(null),
    reason: z.enum(["fabricated_report", "inappropriate_content", "spam", "privacy_concern", "other"], {
      message: "Please choose a reason.",
    }),
    details: optionalText(1000),
  })
  .refine(
    (value) => (value.missingReportId === null) !== (value.foundReportId === null),
    { message: "A report must flag exactly one case.", path: ["missingReportId"] },
  );

export const banUserSchema = z.object({
  isBanned: z.boolean(),
  reason: optionalText(500),
});

export const setRoleSchema = z.object({
  role: z.enum(["user", "admin"]),
});
