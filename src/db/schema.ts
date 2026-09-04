/**
 * Locora database schema — the single source of truth for the data model.
 *
 * `npm run db:generate` reads this file and writes reviewable SQL into
 * `drizzle/`; only that SQL is ever applied to a database. Nothing here is
 * pushed to a live schema directly.
 *
 * Two conventions run through the whole file and are load-bearing rather than
 * stylistic:
 *
 * 1. **UUID primary keys, not sequences.** Missing-person data is sensitive, and
 *    a sequential id leaks volume ("case #4821" tells you roughly how many
 *    cases exist) while also making ids enumerable by anyone who finds one.
 *
 * 2. **Contact details are columns, not a shared table.** Each report carries
 *    its own contact_name / contact_phone / contact_email, and those three
 *    columns are never selected by a public query. The projection that enforces
 *    that lives in src/server/reports/visibility.ts — the database stores them,
 *    the service layer decides who may see them.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  abuseReasonEnum,
  genderEnum,
  matchSourceEnum,
  matchStatusEnum,
  notificationTypeEnum,
  reportStatusEnum,
  userRoleEnum,
} from "./enums";

/** Set by the database rather than by application code, so the value is consistent
 *  no matter which process or region wrote the row. */
const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    /** A scrypt hash — never the password, never reversible. See src/server/auth/password.ts. */
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name"),
    phone: text("phone"),
    role: userRoleEnum("role").notNull().default("user"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    /** A banned account keeps its reports — a reviewer decides those case by case —
     *  but can no longer authenticate or file anything new. */
    isBanned: boolean("is_banned").notNull().default(false),
    bannedReason: text("banned_reason"),
    createdAt,
    updatedAt,
  },
  (table) => [
    // A plain UNIQUE(email) would still treat "Ada@x.com" and "ada@x.com" as two
    // accounts. This is what actually makes them the same login. Addresses are
    // also normalised on the way in (src/lib/validation/auth.ts); this is the
    // constraint that holds even if some future code path forgets to.
    uniqueIndex("users_email_lower_key").on(sql`lower(${table.email})`),
    uniqueIndex("users_phone_key").on(table.phone),
  ],
);

/**
 * One row per live login session.
 *
 * A signed refresh token is not trusted on its own — its `jti` must be present
 * here and un-revoked. That buys two things a stateless token cannot:
 * revocation (logout, password change, forced sign-out) and reuse detection.
 * Tokens rotate on every refresh, so a revoked `jti` presented a second time
 * means the token was captured and replayed; the handler responds by revoking
 * every session the account has.
 */
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jti: text("jti").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Set when this token is rotated out or explicitly revoked. The row is kept
     *  past that point so a replay can still be recognised as one. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt,
  },
  (table) => [
    uniqueIndex("refresh_tokens_jti_key").on(table.jti),
    index("refresh_tokens_user_idx").on(table.userId),
    // Supports the scheduled purge of tokens that are past use.
    index("refresh_tokens_expires_idx").on(table.expiresAt),
  ],
);

/**
 * Email-verification and password-reset tokens.
 *
 * Both flows have the same shape, so they share a table with a `purpose`
 * discriminator rather than duplicating one. Only the SHA-256 hash of the token
 * is stored: a database leak on its own then cannot be used to verify or reset
 * anybody's account. `usedAt` makes each token single-use.
 */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt,
  },
  (table) => [
    uniqueIndex("verification_tokens_hash_key").on(table.tokenHash),
    index("verification_tokens_user_purpose_idx").on(table.userId, table.purpose),
    check(
      "verification_tokens_purpose_check",
      sql`${table.purpose} IN ('email_verification', 'password_reset')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export const missingPersonReports = pgTable(
  "missing_person_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // --- The person ---
    fullName: text("full_name").notNull(),
    age: integer("age").notNull(),
    gender: genderEnum("gender").notNull(),
    heightCm: integer("height_cm"),
    clothingDescription: text("clothing_description"),
    distinguishingFeatures: text("distinguishing_features"),

    // --- Where and when ---
    // `city` is stored separately from the full address, and indexed, because
    // the public feed filters by it on every page load. Filtering with
    // `address ILIKE '%...%'` instead cannot use an index at all.
    lastSeenAddress: text("last_seen_address").notNull(),
    lastSeenCity: text("last_seen_city").notNull(),
    // Nullable on purpose. Someone filing a report in the first hours of a
    // disappearance may not be able to pin a map, and refusing the report over a
    // coordinate would be the wrong trade.
    lastSeenLatitude: doublePrecision("last_seen_latitude"),
    lastSeenLongitude: doublePrecision("last_seen_longitude"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),

    // --- Private: never selected by a public query ---
    contactName: text("contact_name").notNull(),
    contactPhone: text("contact_phone").notNull(),
    contactEmail: text("contact_email"),
    policeReportNumber: text("police_report_number"),

    status: reportStatusEnum("status").notNull().default("pending"),
    /** A reviewer's note. Shown to the reporter — a rejection should not be a
     *  black box — but never to the public. */
    reviewNotes: text("review_notes"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),

    createdAt,
    updatedAt,
  },
  (table) => [
    index("missing_reports_reporter_idx").on(table.reporterId),
    // The public feed selects on status and orders by newest first on every
    // page load. Without the composite index that is a sequential scan plus a
    // full sort, which degrades with every case filed.
    index("missing_reports_status_created_idx").on(table.status, table.createdAt.desc()),
    // City filtering is case-insensitive, so the index has to be too or it goes unused.
    index("missing_reports_city_idx").on(sql`lower(${table.lastSeenCity})`),
    index("missing_reports_last_seen_idx").on(table.lastSeenAt.desc()),
    check("missing_reports_age_check", sql`${table.age} >= 0 AND ${table.age} <= 130`),
    check(
      "missing_reports_height_check",
      sql`${table.heightCm} IS NULL OR (${table.heightCm} > 0 AND ${table.heightCm} < 300)`,
    ),
    // Latitude and longitude are meaningless apart, so the pair is all-or-nothing.
    check(
      "missing_reports_coords_check",
      sql`(${table.lastSeenLatitude} IS NULL) = (${table.lastSeenLongitude} IS NULL)`,
    ),
    check(
      "missing_reports_lat_range_check",
      sql`${table.lastSeenLatitude} IS NULL OR (${table.lastSeenLatitude} BETWEEN -90 AND 90)`,
    ),
    check(
      "missing_reports_lng_range_check",
      sql`${table.lastSeenLongitude} IS NULL OR (${table.lastSeenLongitude} BETWEEN -180 AND 180)`,
    ),
  ],
);

export const foundPersonReports = pgTable(
  "found_person_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // --- The person, as far as anyone can tell ---
    // An age *range*, not a single number: whoever finds an unidentified person
    // can honestly say "somewhere between 60 and 75" and almost never more than
    // that. Forcing a single figure would invite false precision into the one
    // field a match is likely to be tested against.
    estimatedAgeMin: integer("estimated_age_min"),
    estimatedAgeMax: integer("estimated_age_max"),
    gender: genderEnum("gender").notNull(),
    heightCm: integer("height_cm"),
    distinguishingFeatures: text("distinguishing_features"),
    notes: text("notes"),

    foundAddress: text("found_address").notNull(),
    foundCity: text("found_city").notNull(),
    foundLatitude: doublePrecision("found_latitude"),
    foundLongitude: doublePrecision("found_longitude"),
    foundAt: timestamp("found_at", { withTimezone: true }).notNull(),

    // --- Private ---
    /** Where the person is now — a hospital, a shelter, in someone's care. This
     *  is the single most sensitive field in the schema: published openly it
     *  tells anyone, including whoever the person may have fled, exactly where
     *  to find a vulnerable adult or child. Owner and reviewer only, always. */
    currentWhereabouts: text("current_whereabouts"),
    contactName: text("contact_name").notNull(),
    contactPhone: text("contact_phone").notNull(),
    contactEmail: text("contact_email"),

    status: reportStatusEnum("status").notNull().default("pending"),
    reviewNotes: text("review_notes"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),

    createdAt,
    updatedAt,
  },
  (table) => [
    index("found_reports_reporter_idx").on(table.reporterId),
    index("found_reports_status_created_idx").on(table.status, table.createdAt.desc()),
    index("found_reports_city_idx").on(sql`lower(${table.foundCity})`),
    index("found_reports_found_at_idx").on(table.foundAt.desc()),
    check(
      "found_reports_age_range_check",
      sql`(${table.estimatedAgeMin} IS NULL OR (${table.estimatedAgeMin} >= 0 AND ${table.estimatedAgeMin} <= 130))
          AND (${table.estimatedAgeMax} IS NULL OR (${table.estimatedAgeMax} >= 0 AND ${table.estimatedAgeMax} <= 130))
          AND (${table.estimatedAgeMin} IS NULL OR ${table.estimatedAgeMax} IS NULL OR ${table.estimatedAgeMin} <= ${table.estimatedAgeMax})`,
    ),
    check(
      "found_reports_height_check",
      sql`${table.heightCm} IS NULL OR (${table.heightCm} > 0 AND ${table.heightCm} < 300)`,
    ),
    check(
      "found_reports_coords_check",
      sql`(${table.foundLatitude} IS NULL) = (${table.foundLongitude} IS NULL)`,
    ),
    check(
      "found_reports_lat_range_check",
      sql`${table.foundLatitude} IS NULL OR (${table.foundLatitude} BETWEEN -90 AND 90)`,
    ),
    check(
      "found_reports_lng_range_check",
      sql`${table.foundLongitude} IS NULL OR (${table.foundLongitude} BETWEEN -180 AND 180)`,
    ),
  ],
);

/**
 * Photographs attached to a case.
 *
 * One table for both report kinds, discriminated by which foreign key is set,
 * rather than two near-identical tables. A check constraint enforces that
 * exactly one is — the database, not a code path, is what makes an orphaned or
 * doubly-parented photo impossible.
 *
 * Both the canonical Blob URL and its pathname are stored. The URL is what a
 * page renders; the pathname is what a delete call needs. Keeping the URL means
 * no extra environment variable is needed to reconstruct one, which is a step
 * that has no business standing between a deploy and a working page.
 */
export const reportPhotos = pgTable(
  "report_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    missingReportId: uuid("missing_report_id").references(() => missingPersonReports.id, {
      onDelete: "cascade",
    }),
    foundReportId: uuid("found_report_id").references(() => foundPersonReports.id, {
      onDelete: "cascade",
    }),
    blobUrl: text("blob_url").notNull(),
    blobPathname: text("blob_pathname").notNull(),
    /** The type the bytes were verified to actually be, never the one the client
     *  claimed. See src/server/storage/images.ts. */
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt,
  },
  (table) => [
    index("report_photos_missing_idx").on(table.missingReportId, table.sortOrder),
    index("report_photos_found_idx").on(table.foundReportId, table.sortOrder),
    check(
      "report_photos_one_parent_check",
      sql`(${table.missingReportId} IS NOT NULL)::int + (${table.foundReportId} IS NOT NULL)::int = 1`,
    ),
  ],
);

/**
 * A link between one missing-person report and one found-person report.
 *
 * `source` and `confidenceScore` exist now and are unused by the review flow,
 * so an assisted matcher can later insert rows with `source = 'automated'` and
 * a score without a migration. The review console filters on
 * `status = 'possible'` regardless of what created the row, which is what keeps
 * a human in the loop on every confirmation.
 */
export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    missingReportId: uuid("missing_report_id")
      .notNull()
      .references(() => missingPersonReports.id, { onDelete: "cascade" }),
    foundReportId: uuid("found_report_id")
      .notNull()
      .references(() => foundPersonReports.id, { onDelete: "cascade" }),
    status: matchStatusEnum("status").notNull().default("possible"),
    source: matchSourceEnum("source").notNull().default("manual_review"),
    /** 0.0–1.0, populated only by automated matching. Null for human-created links. */
    confidenceScore: doublePrecision("confidence_score"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    // The service layer returns a clean 409 for a duplicate pair, but two
    // reviewers clicking at the same moment both pass that check before either
    // commits. Only the database can make a duplicate actually impossible — and
    // a duplicate here means telling two families a second time about a link
    // they have already been told about.
    uniqueIndex("matches_pair_key").on(table.missingReportId, table.foundReportId),
    index("matches_missing_idx").on(table.missingReportId),
    index("matches_found_idx").on(table.foundReportId),
    index("matches_status_created_idx").on(table.status, table.createdAt.desc()),
    check(
      "matches_confidence_range_check",
      sql`${table.confidenceScore} IS NULL OR (${table.confidenceScore} BETWEEN 0 AND 1)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Communication, moderation, accountability
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** Where clicking the notification should go. A relative path, always. */
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt,
  },
  (table) => [
    index("notifications_user_created_idx").on(table.userId, table.createdAt.desc()),
    // The unread badge runs on every authenticated page load. A partial index
    // keeps that query proportional to unread rows rather than to all rows a
    // user has ever accumulated.
    index("notifications_user_unread_idx")
      .on(table.userId, table.createdAt.desc())
      .where(sql`read_at IS NULL`),
  ],
);

export const abuseReports = pgTable(
  "abuse_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    filedById: uuid("filed_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    missingReportId: uuid("missing_report_id").references(() => missingPersonReports.id, {
      onDelete: "cascade",
    }),
    foundReportId: uuid("found_report_id").references(() => foundPersonReports.id, {
      onDelete: "cascade",
    }),
    reason: abuseReasonEnum("reason").notNull(),
    details: text("details"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    createdAt,
  },
  (table) => [
    index("abuse_reports_open_idx").on(table.createdAt).where(sql`resolved_at IS NULL`),
    index("abuse_reports_filed_by_idx").on(table.filedById),
    check(
      "abuse_reports_one_target_check",
      sql`(${table.missingReportId} IS NOT NULL)::int + (${table.foundReportId} IS NOT NULL)::int = 1`,
    ),
    // One open flag per person per case. Without this, a single user can file
    // the same complaint fifty times and bury the moderation queue.
    uniqueIndex("abuse_reports_unique_open_missing")
      .on(table.filedById, table.missingReportId)
      .where(sql`resolved_at IS NULL AND missing_report_id IS NOT NULL`),
    uniqueIndex("abuse_reports_unique_open_found")
      .on(table.filedById, table.foundReportId)
      .where(sql`resolved_at IS NULL AND found_report_id IS NOT NULL`),
  ],
);

/**
 * Every privileged action, recorded.
 *
 * On a platform holding missing-person data an unaccountable moderator action
 * is not acceptable, so this is a product requirement rather than optional
 * polish. `actorId` is ON DELETE SET NULL: the trail has to outlive the account
 * that created it.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** Denormalised so the record still says who acted after the account is gone. */
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"),
    /** A snapshot of what changed, e.g. {"from":"pending","to":"published"}.
     *  Never personal data — see src/server/admin/audit.ts. */
    metadata: jsonb("metadata"),
    createdAt,
  },
  (table) => [
    index("audit_logs_created_idx").on(table.createdAt.desc()),
    index("audit_logs_actor_idx").on(table.actorId),
    index("audit_logs_target_idx").on(table.targetType, table.targetId),
  ],
);

/**
 * Distributed rate limiting.
 *
 * A per-process counter is wrong on Vercel: every concurrent instance keeps its
 * own, so the effective limit is silently multiplied by however many instances
 * happen to be warm. That is the kind of defect that never shows up in testing
 * and only matters on the day someone is actively abusing the service.
 *
 * This table is the shared counter instead. It is a fixed window incremented by
 * one atomic upsert per check — see src/server/security/rate-limit.ts. Postgres
 * is already a dependency; Redis would be a second vendor, a second set of
 * credentials and a second thing to be down, to solve a problem one indexed
 * table solves at this scale.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    /** "<action>:<subject>", e.g. "login:203.0.113.7" or "report-create:<user-uuid>". */
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("rate_limits_expires_idx").on(table.expiresAt)],
);

// ---------------------------------------------------------------------------
// Relations — used by Drizzle's relational queries to build nested reads
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  missingReports: many(missingPersonReports),
  foundReports: many(foundPersonReports),
  notifications: many(notifications),
  refreshTokens: many(refreshTokens),
}));

export const missingPersonReportsRelations = relations(missingPersonReports, ({ one, many }) => ({
  reporter: one(users, {
    fields: [missingPersonReports.reporterId],
    references: [users.id],
  }),
  photos: many(reportPhotos),
  matches: many(matches),
}));

export const foundPersonReportsRelations = relations(foundPersonReports, ({ one, many }) => ({
  reporter: one(users, {
    fields: [foundPersonReports.reporterId],
    references: [users.id],
  }),
  photos: many(reportPhotos),
  matches: many(matches),
}));

export const reportPhotosRelations = relations(reportPhotos, ({ one }) => ({
  missingReport: one(missingPersonReports, {
    fields: [reportPhotos.missingReportId],
    references: [missingPersonReports.id],
  }),
  foundReport: one(foundPersonReports, {
    fields: [reportPhotos.foundReportId],
    references: [foundPersonReports.id],
  }),
}));

export const matchesRelations = relations(matches, ({ one }) => ({
  missingReport: one(missingPersonReports, {
    fields: [matches.missingReportId],
    references: [missingPersonReports.id],
  }),
  foundReport: one(foundPersonReports, {
    fields: [matches.foundReportId],
    references: [foundPersonReports.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const abuseReportsRelations = relations(abuseReports, ({ one }) => ({
  filedBy: one(users, { fields: [abuseReports.filedById], references: [users.id] }),
  missingReport: one(missingPersonReports, {
    fields: [abuseReports.missingReportId],
    references: [missingPersonReports.id],
  }),
  foundReport: one(foundPersonReports, {
    fields: [abuseReports.foundReportId],
    references: [foundPersonReports.id],
  }),
}));

// ---------------------------------------------------------------------------
// Row types, inferred rather than restated
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type VerificationTokenRow = typeof verificationTokens.$inferSelect;
export type MissingPersonReport = typeof missingPersonReports.$inferSelect;
export type NewMissingPersonReport = typeof missingPersonReports.$inferInsert;
export type FoundPersonReport = typeof foundPersonReports.$inferSelect;
export type NewFoundPersonReport = typeof foundPersonReports.$inferInsert;
export type ReportPhoto = typeof reportPhotos.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AbuseReport = typeof abuseReports.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
