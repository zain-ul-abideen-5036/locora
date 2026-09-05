/**
 * The seeded fixtures, as constants only.
 *
 * Deliberately free of side effects and of any database import, so a spec can
 * reference these values without dragging a connection into the Playwright
 * process. The seeding itself lives in scripts/e2e-seed.ts and runs as its own
 * step before the server starts.
 */

export const E2E_REPORTER = {
  email: "reporter@locora.test",
  password: "E2ePassphrase1",
  fullName: "Bilal Khan",
} as const;

export const E2E_REVIEWER = {
  email: "reviewer@locora.test",
  password: "E2ePassphrase1",
  fullName: "Sana Iqbal",
} as const;

/**
 * Values the specs assert are visible, and values they assert are not.
 *
 * The private ones are distinctive rather than realistic on purpose: a search
 * of the rendered HTML for "+92 300 5550101" cannot produce a false negative
 * the way a search for a common string could.
 */
export const E2E_PUBLISHED_CASE = {
  fullName: "Aisha Khan",
  city: "Lahore",
  contactName: "Farah Siddiqui",
  contactPhone: "+92 300 5550101",
  contactEmail: "private-contact@locora.test",
  policeReportNumber: "FIR-E2E-0001",
} as const;

export const E2E_FOUND_CASE = {
  city: "Lahore",
  currentWhereabouts: "District hospital ward 4",
  contactPhone: "+92 301 5550303",
} as const;

export const E2E_PENDING_CASE = { fullName: "Unreviewed Person" } as const;
