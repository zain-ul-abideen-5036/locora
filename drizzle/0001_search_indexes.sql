-- Trigram indexes for the public case feed's text filters.
--
-- The feed lets somebody search by name and filter by city. Both are
-- substring-insensitive searches — a family looking for "Aisha" should find
-- "Aisha Khan", and somebody typing "lahore" should match "Lahore" — which
-- means ILIKE '%…%'. A plain btree index cannot serve that pattern at all, so
-- without these the query degrades to a sequential scan over every report and
-- gets slower with every case filed.
--
-- pg_trgm is available on Neon and on any standard PostgreSQL 16 install. The
-- GIN indexes below are what make an unanchored ILIKE index-assisted.
--
-- Written by hand rather than generated because Drizzle's schema builder has no
-- vocabulary for an extension or for an operator class.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

-- Name search. Only missing-person reports have a name to search: a found
-- person is by definition not yet identified.
CREATE INDEX IF NOT EXISTS "missing_reports_full_name_trgm_idx"
  ON "missing_person_reports" USING gin (lower("full_name") gin_trgm_ops);
--> statement-breakpoint

-- City filtering, on both report kinds. These sit alongside the btree indexes on
-- lower(city) created in 0000: the btree serves an exact match, which is what
-- the city dropdown produces, and the trigram index serves a partial one typed
-- into the search box. The planner picks whichever fits the query it is given.
CREATE INDEX IF NOT EXISTS "missing_reports_city_trgm_idx"
  ON "missing_person_reports" USING gin (lower("last_seen_city") gin_trgm_ops);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "found_reports_city_trgm_idx"
  ON "found_person_reports" USING gin (lower("found_city") gin_trgm_ops);
